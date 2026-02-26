// physics.js - Projectile simulation with gravity, wind, sub-stepping

import { GRAVITY, PHYSICS_SUBSTEPS, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

export class Projectile {
    constructor(x, y, vx, vy, weaponKey, ownerIndex) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.weaponKey = weaponKey;
        this.ownerIndex = ownerIndex;
        this.active = true;
        this.trail = [];
        this.maxTrail = 30;
        this.age = 0;
        this.prevY = y;  // For apex detection (MIRV)
        this.hasPassedApex = false;
        this.isRolling = false;
        this.rollTimer = 0;
        this.rollDirection = 0;
    }

    update(dt, wind, terrain) {
        if (!this.active) return;

        this.age += dt;
        const subDt = dt / PHYSICS_SUBSTEPS;

        for (let i = 0; i < PHYSICS_SUBSTEPS; i++) {
            this.prevY = this.y;

            if (this.isRolling) {
                this._updateRolling(subDt, terrain);
                continue;
            }

            // Apply forces
            this.vx += wind * subDt;
            this.vy += GRAVITY * subDt;

            // Update position
            this.x += this.vx * subDt;
            this.y += this.vy * subDt;

            // Track apex (vy goes from negative to positive)
            if (this.vy >= 0 && !this.hasPassedApex && this.age > 0.1) {
                this.hasPassedApex = true;
            }

            // Trail
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.maxTrail) {
                this.trail.shift();
            }

            // Bounds check
            if (this.x < -50 || this.x > CANVAS_WIDTH + 50 || this.y > CANVAS_HEIGHT + 50) {
                this.active = false;
                return;
            }

            // Terrain collision
            if (this.y >= 0) {
                const surfaceY = terrain.getSurfaceY(this.x);
                if (this.y >= surfaceY) {
                    this.y = surfaceY;
                    this.active = false;
                    return;
                }
            }
        }
    }

    _updateRolling(dt, terrain) {
        this.rollTimer -= dt;
        if (this.rollTimer <= 0) {
            this.active = false;
            return;
        }

        const speed = 120;
        this.x += this.rollDirection * speed * dt;

        if (this.x < 0 || this.x >= CANVAS_WIDTH) {
            this.active = false;
            return;
        }

        this.y = terrain.getSurfaceY(this.x);

        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrail) {
            this.trail.shift();
        }
    }

    startRolling(terrain, duration) {
        this.isRolling = true;
        this.rollTimer = duration / 1000;
        // Roll in direction of horizontal velocity, or downhill
        if (Math.abs(this.vx) > 10) {
            this.rollDirection = this.vx > 0 ? 1 : -1;
        } else {
            // Roll downhill
            const hLeft = terrain.getHeight(this.x - 5);
            const hRight = terrain.getHeight(this.x + 5);
            this.rollDirection = hLeft > hRight ? 1 : -1;
        }
        this.vx = 0;
        this.vy = 0;
    }
}

export class ProjectileSystem {
    constructor() {
        this.projectiles = [];
    }

    add(projectile) {
        this.projectiles.push(projectile);
    }

    update(dt, wind, terrain) {
        for (const p of this.projectiles) {
            p.update(dt, wind, terrain);
        }
    }

    getImpacted() {
        return this.projectiles.filter(p => !p.active);
    }

    removeInactive() {
        this.projectiles = this.projectiles.filter(p => p.active);
    }

    clear() {
        this.projectiles = [];
    }

    get hasActive() {
        return this.projectiles.some(p => p.active);
    }
}
