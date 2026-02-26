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
import { Network } from './network.js';
import { randRange, clamp, seedRng, unseedRng } from './utils.js';

// Game states
const STATE = {
    MENU: 'menu',
    SETUP: 'setup',
    PLAYING: 'playing',
    AIMING: 'aiming',
    FIRING: 'firing',
    WAITING_SYNC: 'waiting_sync',
    TURN_TRANSITION: 'turn_transition',
    ROUND_END: 'round_end',
    SHOP: 'shop',
    GAME_OVER: 'game_over'
};

export { STATE };

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

        // Online multiplayer state
        this.online = null; // null when offline
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

        // Shift wind (skip in online — host pre-shifts before TURN_SYNC, guest gets it via sync)
        if (!this.online) {
            this.wind = clamp(this.wind + randRange(-15, 15), -WIND_MAX, WIND_MAX);
        }

        // Next player
        let next = (this.currentPlayerIndex + 1) % this.players.length;
        while (!this.players[next].alive) {
            next = (next + 1) % this.players.length;
        }
        this.currentPlayerIndex = next;
        this.state = STATE.TURN_TRANSITION;
        this.stateTimer = TURN_TRANSITION_DELAY / 1000;
        this.aiAimData = null;
        this._updateOnlineOverlay();
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
            if (this.online) {
                this._destroyOnline();
            }
            this.ui.showGameOver(this.players);
            return;
        }

        if (this.online) {
            // Online shop: each player shops independently
            this.state = STATE.SHOP;
            this.online.shopDone = [false, false];
            const localTank = this.players[this.online.localPlayerIndex];
            this.ui.showOnlineShop(localTank, () => {
                this._sendShopDone();
            });
        } else {
            // Show shop
            this.state = STATE.SHOP;
            this.ui.showShop(this.players);
        }
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

            case STATE.WAITING_SYNC:
                // Guest waiting for host's TURN_SYNC — keep particles animating
                this.particles.update(dt, this.terrain);
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

        // Online: remote player's turn — just wait for FIRE message
        if (this.online && !this._isLocalPlayerTurn()) {
            return;
        }

        if (tank.isAI) {
            this._updateAIAiming(dt, tank);
        } else {
            const action = this.input.processAiming(tank, this.terrain, dt);
            if (action === 'fire') {
                // Online: send fire params to opponent
                if (this.online) {
                    this.online.network.send('FIRE', {
                        angle: tank.aimAngle,
                        power: tank.power,
                        weaponKey: tank.selectedWeaponKey,
                        tankX: tank.x,
                        hasBattery: tank.hasBattery
                    });
                }
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
        this._firingMinTime = 0.3;
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

        // Minimum firing time to prevent instant cycling
        if (this._firingMinTime > 0) {
            this._firingMinTime -= dt;
            return;
        }

        // Advance turn as soon as projectiles and effects are done
        // Particles keep animating in the background
        if (!this.projectiles.hasActive && !this.weaponSystem.hasActiveEffects) {
            this._processTurnResults();

            if (this.online) {
                if (this.online.isHost) {
                    // Host: compute next wind, send sync, then advance
                    const alive = this.players.filter(p => p.alive);
                    const roundEnding = alive.length <= 1;
                    if (!roundEnding) {
                        this.wind = clamp(this.wind + randRange(-15, 15), -WIND_MAX, WIND_MAX);
                    }
                    this._sendTurnSync();
                    this.nextTurn();
                } else {
                    // Guest: wait for TURN_SYNC from host
                    this.state = STATE.WAITING_SYNC;
                }
            } else {
                this.nextTurn();
            }
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

    get isActiveGameState() {
        return this.state === STATE.AIMING || this.state === STATE.FIRING ||
               this.state === STATE.WAITING_SYNC || this.state === STATE.TURN_TRANSITION ||
               this.state === STATE.ROUND_END || this.state === STATE.SHOP;
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
            const showAim = tank.alive && !tank.isAI && (!this.online || this._isLocalPlayerTurn());
            if (showAim) {
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

    _sendTurnSync() {
        if (!this.online || !this.online.isHost) return;

        const alive = this.players.filter(p => p.alive);
        const roundEnding = alive.length <= 1;

        // Find next player
        let nextPlayer = (this.currentPlayerIndex + 1) % this.players.length;
        while (!this.players[nextPlayer].alive && !roundEnding) {
            nextPlayer = (nextPlayer + 1) % this.players.length;
        }

        this.online.network.send('TURN_SYNC', {
            wind: this.wind,
            healths: this.players.map(p => p.health),
            alives: this.players.map(p => p.alive),
            heightmap: Array.from(this.terrain.heightmap),
            nextPlayer,
            roundEnd: roundEnding
        });
    }

    // Called from main menu
    showSetup() {
        this.state = STATE.SETUP;
        this.ui.showSetup();
    }

    // === ONLINE MULTIPLAYER ===

    async _loadPeerJS() {
        if (window.Peer) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load PeerJS'));
            document.head.appendChild(script);
        });
    }

    async hostOnlineGame(name, rounds) {
        await this._loadPeerJS();

        const network = new Network();
        const roomCode = await network.host();

        this.online = {
            network,
            isHost: true,
            localPlayerIndex: 0,
            localName: name,
            remoteName: null,
            rounds: rounds || 5,
            seed: 0,
            shopDone: [false, false],
            pendingFire: null
        };

        network.onMessage = (type, payload) => this._handleNetworkMessage(type, payload);
        network.onDisconnected = () => this._handleDisconnect();
        network.onError = (err) => console.error('Network error:', err);

        network.onConnected = () => {
            // Guest connected, send ROOM_READY
            const seed = Math.floor(Math.random() * 2147483647);
            const wind = randRange(-WIND_MAX, WIND_MAX);
            this.online.seed = seed;
            this.online.initialWind = wind;

            network.send('ROOM_READY', {
                seed,
                wind,
                hostName: name,
                rounds: this.online.rounds
            });

            // Update status in waiting screen
            const statusEl = document.getElementById('host-wait-status');
            if (statusEl) {
                statusEl.textContent = 'Player connected! Starting...';
                statusEl.className = 'online-status connected';
            }
        };

        this.ui.showHostWaiting(roomCode);
    }

    async joinOnlineGame(code, name) {
        await this._loadPeerJS();

        const network = new Network();
        await network.join(code);

        this.online = {
            network,
            isHost: false,
            localPlayerIndex: 1,
            localName: name,
            remoteName: null,
            rounds: 5,
            seed: 0,
            shopDone: [false, false],
            pendingFire: null
        };

        network.onMessage = (type, payload) => this._handleNetworkMessage(type, payload);
        network.onDisconnected = () => this._handleDisconnect();
        network.onError = (err) => console.error('Network error:', err);

        // Wait for ROOM_READY from host (handled in _handleNetworkMessage)
        this.ui.showOnlineWaiting('Connected! Waiting for host...');
    }

    _handleNetworkMessage(type, payload) {
        switch (type) {
            case 'ROOM_READY':
                this._onRoomReady(payload);
                break;
            case 'GUEST_READY':
                this._onGuestReady(payload);
                break;
            case 'FIRE':
                this._onRemoteFire(payload);
                break;
            case 'TURN_SYNC':
                this._onTurnSync(payload);
                break;
            case 'SHOP_DONE':
                this._onRemoteShopDone(payload);
                break;
            case 'ROUND_START':
                this._onRoundStart(payload);
                break;
        }
    }

    _onRoomReady(payload) {
        // Guest receives this
        if (!this.online || this.online.isHost) return;

        this.online.seed = payload.seed;
        this.online.initialWind = payload.wind;
        this.online.remoteName = payload.hostName;
        this.online.rounds = payload.rounds;

        // Send GUEST_READY back
        this.online.network.send('GUEST_READY', {
            guestName: this.online.localName
        });

        // Start the game
        this._startOnlineGame();
    }

    _onGuestReady(payload) {
        // Host receives this
        if (!this.online || !this.online.isHost) return;

        this.online.remoteName = payload.guestName;

        // Start the game
        this._startOnlineGame();
    }

    _startOnlineGame() {
        const o = this.online;
        const hostName = o.isHost ? o.localName : o.remoteName;
        const guestName = o.isHost ? o.remoteName : o.localName;

        this.totalRounds = o.rounds;
        this.currentRound = 1;
        this.players = [
            new Tank(0, hostName, false, 'easy'),
            new Tank(1, guestName, false, 'easy')
        ];

        this.ui.hideAll();
        this._startOnlineRound(o.seed, o.initialWind);
    }

    _startOnlineRound(seed, wind) {
        // Seed the PRNG for deterministic terrain
        seedRng(seed);

        // Generate terrain (will use seeded PRNG)
        this.terrain.generate();

        // Unseed so non-terrain randomness is normal
        unseedRng();

        this.renderer.randomizeSky();

        // Reset systems
        this.projectiles.clear();
        this.particles.clear();
        this.wind = wind;

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
        this._updateOnlineOverlay();
    }

    _onRemoteFire(payload) {
        if (!this.online) return;

        // Apply the remote player's fire parameters
        const tank = this.players[this.currentPlayerIndex];
        tank.aimAngle = payload.angle;
        tank.power = payload.power;
        if (payload.weaponKey && tank.weapons[payload.weaponKey]) {
            tank.selectedWeaponKey = payload.weaponKey;
        }
        // Sync tank position in case of movement
        if (payload.tankX != null) {
            tank.x = payload.tankX;
            tank.surfaceY = this.terrain.getSurfaceY(tank.x);
            tank.terrainAngle = this.terrain.getAngleAt(tank.x);
        }
        if (payload.hasBattery != null) {
            tank.hasBattery = payload.hasBattery;
        }

        this._fireCurrentWeapon(tank);
        this.ui.setOnlineOverlay(null);
    }

    _onTurnSync(payload) {
        if (!this.online || this.online.isHost) return;

        this._applyTurnSync(payload);
    }

    _applyTurnSync(payload) {
        // Apply authoritative state from host
        this.wind = payload.wind;

        // Sync healths and alive status
        for (let i = 0; i < this.players.length; i++) {
            if (payload.healths && payload.healths[i] != null) {
                this.players[i].health = payload.healths[i];
            }
            if (payload.alives && payload.alives[i] != null) {
                this.players[i].alive = payload.alives[i];
            }
        }

        // Sync heightmap for drift correction
        if (payload.heightmap) {
            this.terrain.heightmap.set(new Float64Array(payload.heightmap));
            this.terrain.dirty = true;
            this.terrain.dirtyColumns.clear();
        }

        // Advance turn
        if (payload.roundEnd) {
            // Round ended — guest runs the same endRound logic
            const alive = this.players.filter(p => p.alive);
            this._endRound(alive[0] || null);
            return;
        }

        this.state = STATE.AIMING;
        this.currentPlayerIndex = payload.nextPlayer;
        this._updateOnlineOverlay();
    }

    _onRemoteShopDone(payload) {
        if (!this.online) return;

        const idx = payload.playerIndex;
        // Apply remote player's purchases
        if (payload.weapons) {
            this.players[idx].weapons = payload.weapons;
            // Restore Infinity for basic
            this.players[idx].weapons.basic = Infinity;
        }
        if (payload.shieldHP != null) this.players[idx].shieldHP = payload.shieldHP;
        if (payload.fuel != null) this.players[idx].fuel = payload.fuel;
        if (payload.hasParachute != null) this.players[idx].hasParachute = payload.hasParachute;
        if (payload.hasBattery != null) this.players[idx].hasBattery = payload.hasBattery;
        if (payload.money != null) this.players[idx].money = payload.money;

        this.online.shopDone[idx] = true;

        // If host and both done, send ROUND_START
        if (this.online.isHost && this.online.shopDone[0] && this.online.shopDone[1]) {
            const seed = Math.floor(Math.random() * 2147483647);
            const wind = randRange(-WIND_MAX, WIND_MAX);
            this.currentRound++;

            this.online.network.send('ROUND_START', {
                seed,
                wind,
                round: this.currentRound
            });

            this.ui.hideAll();
            this._startOnlineRound(seed, wind);
        } else {
            // Waiting for other player
            this.ui.showOnlineWaiting('Waiting for opponent to finish shopping...');
        }
    }

    _onRoundStart(payload) {
        // Guest receives this
        if (!this.online || this.online.isHost) return;

        this.currentRound = payload.round;
        this.ui.hideAll();
        this._startOnlineRound(payload.seed, payload.wind);
    }

    _handleDisconnect() {
        const wasOnline = !!this.online;
        this._destroyOnline();

        if (wasOnline) {
            alert('Opponent disconnected!');
            this.state = STATE.MENU;
            this.ui.showMainMenu();
        }
    }

    _destroyOnline() {
        if (this.online) {
            this.online.network.destroy();
            this.online = null;
        }
        this.ui.setOnlineOverlay(null);
        unseedRng();
    }

    _isLocalPlayerTurn() {
        return this.online && this.currentPlayerIndex === this.online.localPlayerIndex;
    }

    _updateOnlineOverlay() {
        if (!this.online) {
            this.ui.setOnlineOverlay(null);
            return;
        }
        if (this.state === STATE.AIMING && !this._isLocalPlayerTurn()) {
            this.ui.setOnlineOverlay('Opponent is aiming...');
        } else {
            this.ui.setOnlineOverlay(null);
        }
    }

    _sendShopDone() {
        if (!this.online) return;
        const idx = this.online.localPlayerIndex;
        const tank = this.players[idx];

        // Serialize weapons (convert Infinity to a sentinel)
        const weapons = {};
        for (const [k, v] of Object.entries(tank.weapons)) {
            weapons[k] = v === Infinity ? -1 : v;
        }

        this.online.network.send('SHOP_DONE', {
            playerIndex: idx,
            weapons,
            shieldHP: tank.shieldHP,
            fuel: tank.fuel,
            hasParachute: tank.hasParachute,
            hasBattery: tank.hasBattery,
            money: tank.money
        });

        this.online.shopDone[idx] = true;

        // If host and both done, send ROUND_START
        if (this.online.isHost && this.online.shopDone[0] && this.online.shopDone[1]) {
            const seed = Math.floor(Math.random() * 2147483647);
            const wind = randRange(-WIND_MAX, WIND_MAX);
            this.currentRound++;

            this.online.network.send('ROUND_START', {
                seed,
                wind,
                round: this.currentRound
            });

            this.ui.hideAll();
            this._startOnlineRound(seed, wind);
        } else {
            this.ui.showOnlineWaiting('Waiting for opponent to finish shopping...');
        }
    }
}
