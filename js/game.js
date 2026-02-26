// game.js - State machine: menu → setup → playing → shop → results

import { WEAPONS, WIND_MAX, TURN_TRANSITION_DELAY, AI_THINK_DELAY, AI_AIM_DURATION,
         ROUND_END_DELAY, KILL_BONUS, DAMAGE_SCORE_MULTIPLIER, ROUND_WIN_BONUS,
         SURVIVAL_BONUS, CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_COLORS } from './constants.js';
import { Terrain } from './terrain.js';
import { Tank } from './tank.js';
import { Renderer } from './renderer.js';
import { ProjectileSystem } from './physics.js';
import { ParticleSystem } from './particles.js';
import { WeaponSystem } from './weapons.js';
import { Input } from './input.js';
import { AI } from './ai.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { randRange, clamp } from './utils.js';

// Game states
const STATE = {
    MENU: 'menu',
    SETUP: 'setup',
    PLAYING: 'playing',
    AIMING: 'aiming',
    FIRING: 'firing',
    TURN_TRANSITION: 'turn_transition',
    ROUND_END: 'round_end',
    SHOP: 'shop',
    GAME_OVER: 'game_over'
};

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        this.terrain = new Terrain();
        this.projectiles = new ProjectileSystem();
        this.particles = new ParticleSystem();
        this.input = new Input();
        this.audio = new Audio();
        this.ui = new UI(this);
        this.ai = new AI();

        this.weaponSystem = null; // Created per round

        // Game config
        this.players = [];
        this.totalRounds = 5;
        this.currentRound = 1;
        this.currentPlayerIndex = 0;
        this.wind = 0;

        // State
        this.state = STATE.MENU;
        this.stateTimer = 0;
        this.turnResults = [];

        // AI aiming state
        this.aiAimData = null;
    }

    init() {
        this.input.init();
        this.ui.init();
        this.ui.showMainMenu();
    }

    // Called from UI after setup
    startGame(config) {
        // config: { players: [{name, isAI, aiDifficulty}], rounds }
        this.totalRounds = config.rounds;
        this.currentRound = 1;
        this.players = config.players.map((p, i) => {
            const tank = new Tank(i, p.name, p.isAI, p.aiDifficulty);
            return tank;
        });
        this.ui.hideAll();
        this.startRound();
    }

    startRound() {
        // Generate terrain
        this.terrain.generate();
        this.renderer.randomizeSky();

        // Reset systems
        this.projectiles.clear();
        this.particles.clear();
        this.wind = randRange(-WIND_MAX, WIND_MAX);

        // Create weapon system
        this.weaponSystem = new WeaponSystem(
            this.projectiles, this.particles, this.terrain, this.renderer, this.audio
        );

        // Reset and place tanks
        const positions = this.terrain.findTankPositions(this.players.length);
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].reset();
            this.players[i].placeOnTerrain(this.terrain, positions[i]);
        }

        this.currentPlayerIndex = 0;
        this._findNextAlivePlayer();
        this.state = STATE.AIMING;
        this.stateTimer = 0;
        this.aiAimData = null;

        this.audio.playWind();
    }

    _findNextAlivePlayer() {
        const start = this.currentPlayerIndex;
        let i = start;
        do {
            if (this.players[i].alive) {
                this.currentPlayerIndex = i;
                return;
            }
            i = (i + 1) % this.players.length;
        } while (i !== start);
    }

    nextTurn() {
        // Check round end
        const alive = this.players.filter(p => p.alive);
        if (alive.length <= 1) {
            this._endRound(alive[0] || null);
            return;
        }

        // Shift wind
        this.wind = clamp(this.wind + randRange(-15, 15), -WIND_MAX, WIND_MAX);

        // Next player
        let next = (this.currentPlayerIndex + 1) % this.players.length;
        while (!this.players[next].alive) {
            next = (next + 1) % this.players.length;
        }
        this.currentPlayerIndex = next;
        this.state = STATE.TURN_TRANSITION;
        this.stateTimer = TURN_TRANSITION_DELAY / 1000;
        this.aiAimData = null;
    }

    _endRound(winner) {
        // Score
        for (const p of this.players) {
            if (p.alive) {
                p.money += ROUND_WIN_BONUS + SURVIVAL_BONUS;
                p.score += ROUND_WIN_BONUS;
                p.roundsWon++;
            }
        }

        this.state = STATE.ROUND_END;
        this.stateTimer = ROUND_END_DELAY / 1000;
        this.roundWinner = winner;
    }

    _advanceAfterRound() {
        if (this.currentRound >= this.totalRounds) {
            this.state = STATE.GAME_OVER;
            this.ui.showGameOver(this.players);
            return;
        }
        // Show shop
        this.state = STATE.SHOP;
        this.ui.showShop(this.players);
    }

    // Called from UI after shop
    finishShopping() {
        this.ui.hideAll();
        this.currentRound++;
        this.startRound();
    }

    update(dt) {
        switch (this.state) {
            case STATE.MENU:
            case STATE.SETUP:
            case STATE.SHOP:
            case STATE.GAME_OVER:
                // UI-driven states, no game update needed
                break;

            case STATE.AIMING:
                this._updateAiming(dt);
                break;

            case STATE.FIRING:
                this._updateFiring(dt);
                break;

            case STATE.TURN_TRANSITION:
                this.stateTimer -= dt;
                this.particles.update(dt, this.terrain); // Keep particles animating
                if (this.stateTimer <= 0) {
                    this.state = STATE.AIMING;
                }
                break;

            case STATE.ROUND_END:
                this.stateTimer -= dt;
                this.particles.update(dt, this.terrain);
                if (this.stateTimer <= 0) {
                    this._advanceAfterRound();
                }
                break;
        }
    }

    _updateAiming(dt) {
        // Keep particles animating in background
        this.particles.update(dt, this.terrain);

        const tank = this.players[this.currentPlayerIndex];
        if (!tank.alive) {
            this.nextTurn();
            return;
        }

        if (tank.isAI) {
            this._updateAIAiming(dt, tank);
        } else {
            const action = this.input.processAiming(tank, this.terrain, dt);
            if (action === 'fire') {
                this._fireCurrentWeapon(tank);
            }
        }
    }

    _updateAIAiming(dt, tank) {
        if (!this.aiAimData) {
            // Start AI thinking
            const targets = this.players.filter(p => p.alive && p !== tank);
            const solution = this.ai.calculateShot(tank, targets, this.terrain, this.wind, tank.aiDifficulty);
            this.aiAimData = {
                targetAngle: solution.angle,
                targetPower: solution.power,
                weaponKey: solution.weaponKey,
                thinkTimer: AI_THINK_DELAY / 1000,
                aimTimer: AI_AIM_DURATION / 1000,
                phase: 'thinking'
            };
            // Select weapon
            if (tank.weapons[solution.weaponKey]) {
                tank.selectedWeaponKey = solution.weaponKey;
            }
        }

        const aim = this.aiAimData;
        if (aim.phase === 'thinking') {
            aim.thinkTimer -= dt;
            if (aim.thinkTimer <= 0) aim.phase = 'aiming';
            return;
        }

        // Gradually adjust angle and power
        const t = 1 - (aim.aimTimer / (AI_AIM_DURATION / 1000));
        if (aim.phase === 'aiming') {
            const angleDiff = aim.targetAngle - tank.aimAngle;
            const powerDiff = aim.targetPower - tank.power;
            tank.aimAngle += angleDiff * dt * 3;
            tank.power += powerDiff * dt * 3;

            aim.aimTimer -= dt;
            if (aim.aimTimer <= 0) {
                tank.aimAngle = aim.targetAngle;
                tank.power = aim.targetPower;
                this._fireCurrentWeapon(tank);
            }
        }
    }

    _fireCurrentWeapon(tank) {
        this.weaponSystem.fire(tank);
        this.state = STATE.FIRING;
        this.turnResults = [];
        this._turnEndTimer = null;
    }

    _updateFiring(dt) {
        // Update projectiles (with tank collision detection)
        this.projectiles.update(dt, this.wind, this.terrain, this.players);

        // Check MIRV splits (only for active MIRVs that passed apex)
        const mirvSplits = [];
        for (const p of this.projectiles.projectiles) {
            if (p.active && p.weaponKey === 'mirv' && p.hasPassedApex) {
                const bomblets = this.weaponSystem.checkMIRVSplit(p);
                mirvSplits.push(...bomblets);
                p._mirvSplit = true; // Mark for removal, don't process as impact
            }
        }
        for (const b of mirvSplits) {
            this.projectiles.add(b);
        }

        // Handle impacts (inactive projectiles that aren't MIRV parents)
        const impacted = this.projectiles.getImpacted().filter(p => !p._mirvSplit);
        for (const p of impacted) {
            if (p.weaponKey === 'roller' && !p.isRolling) {
                // Roller just hit ground, start rolling
                this.weaponSystem.handleImpact(p, this.players);
                // handleImpact re-activates the roller in place
            } else if (p.isRolling) {
                // Roller stopped rolling
                const results = this.weaponSystem.handleRollerStop(p, this.players);
                this.turnResults.push(...results);
            } else {
                const results = this.weaponSystem.handleImpact(p, this.players);
                this.turnResults.push(...results);
            }
        }
        // Now remove all inactive projectiles (MIRV parents + detonated ones)
        this.projectiles.removeInactive();

        // Update laser
        const laserResults = this.weaponSystem.updateLaser(dt, this.players);
        this.turnResults.push(...laserResults);

        // Update pending effects (napalm burns)
        const effectResults = this.weaponSystem.updatePendingEffects(dt, this.players);
        this.turnResults.push(...effectResults);

        // Update particles
        this.particles.update(dt, this.terrain);

        // Spawn trails for active projectiles
        for (const p of this.projectiles.projectiles) {
            if (p.active) {
                this.particles.spawnTrail(p.x, p.y);
            }
        }

        // Update tank positions (falling into craters)
        for (const tank of this.players) {
            if (tank.alive) {
                tank.updatePosition(this.terrain);
                const fallDmg = tank.applyFallDamage();
                if (fallDmg > 0) {
                    this.turnResults.push({
                        tank,
                        damage: fallDmg,
                        killed: !tank.alive,
                        ownerIndex: -1
                    });
                }
            }
        }

        // Advance turn as soon as projectiles and effects are done
        // Particles keep animating in the background
        if (!this.projectiles.hasActive && !this.weaponSystem.hasActiveEffects) {
            this._processTurnResults();
            this.nextTurn();
        }
    }

    _processTurnResults() {
        for (const result of this.turnResults) {
            if (result.killed && result.ownerIndex >= 0) {
                const killer = this.players[result.ownerIndex];
                if (killer && killer !== result.tank) {
                    killer.money += KILL_BONUS;
                    killer.score += KILL_BONUS;
                    killer.kills++;
                }
            }
            if (result.ownerIndex >= 0 && this.players[result.ownerIndex] !== result.tank) {
                const shooter = this.players[result.ownerIndex];
                if (shooter) {
                    shooter.score += result.damage * DAMAGE_SCORE_MULTIPLIER;
                    shooter.money += result.damage * DAMAGE_SCORE_MULTIPLIER;
                }
            }
        }
    }

    render() {
        const ctx = this.renderer.ctx;

        // Always draw sky
        this.renderer.clear();

        if (this.state === STATE.MENU || this.state === STATE.SETUP ||
            this.state === STATE.SHOP || this.state === STATE.GAME_OVER) {
            return; // UI overlay handles these
        }

        // Apply screen shake
        this.renderer.applyShake(1 / 60);

        // Draw terrain
        this.terrain.render(ctx);

        // Draw tanks
        for (let i = 0; i < this.players.length; i++) {
            const isActive = (i === this.currentPlayerIndex && this.state === STATE.AIMING);
            this.renderer.drawTank(this.players[i], isActive);
        }

        // Draw aim indicator for active player
        if (this.state === STATE.AIMING) {
            const tank = this.players[this.currentPlayerIndex];
            if (tank.alive && !tank.isAI) {
                this.renderer.drawAimIndicator(tank);
                this.renderer.drawPowerMeter(tank);
            }
        }

        // Draw projectiles
        for (const p of this.projectiles.projectiles) {
            if (p.active) {
                this.renderer.drawProjectile(p);
            }
        }

        // Draw laser
        this.weaponSystem?.renderLaser(ctx);

        // Draw particles
        this.particles.render(ctx);

        // Draw flash
        this.renderer.drawFlash(1 / 60);

        // Restore shake
        this.renderer.restoreShake();

        // Draw HUD
        this.renderer.drawHUD({
            currentPlayer: this.currentPlayerIndex,
            players: this.players,
            wind: this.wind,
            roundNum: this.currentRound,
            totalRounds: this.totalRounds
        });

        // Round end overlay
        if (this.state === STATE.ROUND_END) {
            this._drawRoundEndOverlay(ctx);
        }
    }

    _drawRoundEndOverlay(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';

        if (this.roundWinner) {
            const color = PLAYER_COLORS[this.roundWinner.playerIndex];
            ctx.fillStyle = color.main;
            ctx.fillText(`${this.roundWinner.name} wins the round!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
        } else {
            ctx.fillText('Draw!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
        }

        ctx.fillStyle = '#aaa';
        ctx.font = '18px monospace';
        ctx.fillText(`Round ${this.currentRound} of ${this.totalRounds}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    }

    // Called from main menu
    showSetup() {
        this.state = STATE.SETUP;
        this.ui.showSetup();
    }
}
