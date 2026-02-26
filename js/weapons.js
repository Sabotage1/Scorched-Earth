// weapons.js - Weapon behavior functions

import { WEAPONS, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { Projectile } from './physics.js';
import { randRange } from './utils.js';

export class WeaponSystem {
    constructor(projectileSystem, particleSystem, terrain, renderer, audio) {
        this.projectiles = projectileSystem;
        this.particles = particleSystem;
        this.terrain = terrain;
        this.renderer = renderer;
        this.audio = audio;
        this.pendingEffects = []; // For delayed effects like napalm burns
        this.laserBeam = null;
    }

    fire(tank) {
        const weapon = tank.currentWeapon;
        const weaponKey = tank.currentWeaponKey;
        const muzzle = tank.getMuzzlePosition(this.terrain);
        const vel = tank.getFireVelocity();

        tank.consumeWeapon();

        if (weapon.type === 'laser') {
            this._fireLaser(muzzle, tank);
            return;
        }

        const proj = new Projectile(
            muzzle.x, muzzle.y,
            vel.vx, vel.vy,
            weaponKey,
            tank.playerIndex
        );
        this.projectiles.add(proj);

        if (this.audio) this.audio.playShoot();
    }

    // Handle projectile impacts
    handleImpact(projectile, tanks) {
        const weapon = WEAPONS[projectile.weaponKey];
        const x = projectile.x;
        const y = projectile.y;
        const results = [];

        switch (weapon.type) {
            case 'projectile':
                results.push(...this._explode(x, y, weapon, projectile.ownerIndex, tanks));
                break;

            case 'mirv':
                // Already handled by split check in update
                results.push(...this._explode(x, y, weapon, projectile.ownerIndex, tanks));
                break;

            case 'napalm':
                results.push(...this._explode(x, y, weapon, projectile.ownerIndex, tanks));
                this.particles.spawnNapalm(x, y, weapon.particleCount);
                this._scheduleNapalmBurns(x, y, weapon, projectile.ownerIndex);
                break;

            case 'dirtbomb':
                this.terrain.addTerrain(x, y, weapon.blastRadius);
                this.particles.spawnDirt(x, y, weapon.blastRadius);
                if (this.audio) this.audio.playDirt();
                break;

            case 'roller':
                // Roller continues rolling - reactivate in place (don't re-add)
                projectile.active = true;
                projectile.startRolling(this.terrain, weapon.rollDuration);
                return results; // Don't explode yet

            case 'nuke':
                results.push(...this._nukeExplode(x, y, weapon, projectile.ownerIndex, tanks));
                break;

            default:
                results.push(...this._explode(x, y, weapon, projectile.ownerIndex, tanks));
        }

        return results;
    }

    // Handle roller final detonation
    handleRollerStop(projectile, tanks) {
        const weapon = WEAPONS[projectile.weaponKey];
        return this._explode(projectile.x, projectile.y, weapon, projectile.ownerIndex, tanks);
    }

    // Check if MIRV should split
    checkMIRVSplit(projectile) {
        if (projectile.weaponKey !== 'mirv') return [];
        if (!projectile.hasPassedApex) return [];

        const weapon = WEAPONS.mirv;
        const bomblets = [];

        for (let i = 0; i < weapon.bombletCount; i++) {
            const spread = (i - 2) * 30;
            const bomblet = new Projectile(
                projectile.x, projectile.y,
                projectile.vx + spread,
                projectile.vy + randRange(-20, 20),
                'basic', // Bomblets use basic explosion
                projectile.ownerIndex
            );
            bomblet.hasPassedApex = true; // Prevent re-splitting
            bomblets.push(bomblet);
        }

        projectile.active = false;
        return bomblets;
    }

    _explode(x, y, weapon, ownerIndex, tanks) {
        this.terrain.destroyCircle(x, y, weapon.blastRadius);
        this.particles.spawnExplosion(x, y, weapon.blastRadius);
        this.renderer.shake(weapon.blastRadius / 5);

        if (this.audio) this.audio.playExplosion(weapon.blastRadius);

        return this._calculateDamage(x, y, weapon, ownerIndex, tanks);
    }

    _nukeExplode(x, y, weapon, ownerIndex, tanks) {
        this.terrain.destroyCircle(x, y, weapon.blastRadius);
        this.particles.spawnNukeExplosion(x, y, weapon.blastRadius);
        this.renderer.shake(20);
        this.renderer.flash(0.9);

        if (this.audio) this.audio.playNuke();

        return this._calculateDamage(x, y, weapon, ownerIndex, tanks);
    }

    _fireLaser(muzzle, tank) {
        // Laser fires straight down from top of screen at target x
        const targetX = muzzle.x + Math.cos(tank.aimAngle * Math.PI / 180) * 200;
        const targetY = this.terrain.getSurfaceY(targetX);
        const weapon = WEAPONS.laser;

        this.laserBeam = {
            fromX: targetX,
            fromY: 0,
            toX: targetX,
            toY: targetY,
            progress: 0,
            duration: 0.5,
            weapon,
            ownerIndex: tank.playerIndex,
            processed: false
        };

        if (this.audio) this.audio.playLaser();
    }

    updateLaser(dt, tanks) {
        if (!this.laserBeam) return [];
        const laser = this.laserBeam;
        laser.progress += dt / laser.duration;

        if (laser.progress >= 0.3 && !laser.processed) {
            laser.processed = true;
            this.terrain.destroyCircle(laser.toX, laser.toY, laser.weapon.blastRadius);
            this.particles.spawnExplosion(laser.toX, laser.toY, laser.weapon.blastRadius);
            this.renderer.shake(5);
            const results = this._calculateDamage(
                laser.toX, laser.toY, laser.weapon, laser.ownerIndex, tanks
            );
            return results;
        }

        if (laser.progress >= 1) {
            this.laserBeam = null;
        }

        return [];
    }

    renderLaser(ctx) {
        if (!this.laserBeam) return;
        this.renderer.drawLaser(
            this.laserBeam.fromX, this.laserBeam.fromY,
            this.laserBeam.toX, this.laserBeam.toY,
            this.laserBeam.progress
        );
    }

    _calculateDamage(x, y, weapon, ownerIndex, tanks) {
        const results = [];
        for (const tank of tanks) {
            if (!tank.alive) continue;
            const dx = tank.x - x;
            const dy = tank.surfaceY - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const radius = weapon.blastRadius * 1.5; // Damage extends a bit beyond blast

            if (distance < radius) {
                const falloff = 1 - (distance / radius);
                const damage = Math.floor(weapon.damage * 1.5 * falloff);
                if (damage > 0) {
                    tank.takeDamage(damage);
                    const killed = !tank.alive;
                    results.push({
                        tank,
                        damage,
                        killed,
                        ownerIndex
                    });
                    // Big death explosion when tank is destroyed
                    if (killed) {
                        this.particles.spawnNukeExplosion(tank.x, tank.surfaceY, 50);
                        this.terrain.destroyCircle(tank.x, tank.surfaceY, 35);
                        this.renderer.shake(15);
                        this.renderer.flash(0.6);
                        if (this.audio) this.audio.playExplosion(60);
                    }
                }
            }
        }
        return results;
    }

    _scheduleNapalmBurns(x, y, weapon, ownerIndex) {
        // Schedule periodic damage ticks for napalm area
        const ticks = 5;
        const interval = weapon.burnDuration / ticks;
        for (let i = 1; i <= ticks; i++) {
            this.pendingEffects.push({
                time: i * interval / 1000,
                type: 'napalm_tick',
                x,
                y,
                radius: weapon.blastRadius * 2,
                damage: 5,
                ownerIndex
            });
        }
    }

    updatePendingEffects(dt, tanks) {
        const results = [];
        for (let i = this.pendingEffects.length - 1; i >= 0; i--) {
            const effect = this.pendingEffects[i];
            effect.time -= dt;
            if (effect.time <= 0) {
                if (effect.type === 'napalm_tick') {
                    // Small terrain burn
                    this.terrain.destroyCircle(effect.x, effect.y, 5);
                    // Damage tanks in range
                    for (const tank of tanks) {
                        if (!tank.alive) continue;
                        const dist = Math.sqrt((tank.x - effect.x) ** 2 + (tank.surfaceY - effect.y) ** 2);
                        if (dist < effect.radius) {
                            const dmg = tank.takeDamage(effect.damage);
                            results.push({ tank, damage: effect.damage, killed: !tank.alive, ownerIndex: effect.ownerIndex });
                        }
                    }
                }
                this.pendingEffects.splice(i, 1);
            }
        }
        return results;
    }

    get hasActiveEffects() {
        return this.laserBeam != null || this.pendingEffects.length > 0;
    }
}
