// tank.js - Tank entity: position, health, inventory, aiming

import { TANK_MAX_HEALTH, TANK_WIDTH, TANK_HEIGHT, TANK_TURRET_LENGTH, MAX_POWER, MIN_POWER,
         WEAPONS, STARTING_MONEY, FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_PER_PIXEL,
         CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { clamp } from './utils.js';

export class Tank {
    constructor(playerIndex, name, isAI = false, aiDifficulty = 'easy') {
        this.playerIndex = playerIndex;
        this.name = name;
        this.isAI = isAI;
        this.aiDifficulty = aiDifficulty;

        // Position
        this.x = 0;
        this.surfaceY = 0;
        this.terrainAngle = 0;

        // State
        this.health = TANK_MAX_HEALTH;
        this.alive = true;
        this.shieldHP = 0;
        this.hasParachute = false;
        this.hasBattery = false;
        this.fuel = 20;

        // Aiming
        this.aimAngle = 90; // degrees, 0=right, 90=up, 180=left
        this.power = 250;

        // Inventory
        this.weapons = { basic: Infinity };
        this.items = {};
        this.selectedWeaponKey = 'basic';

        // Economy
        this.money = STARTING_MONEY;
        this.score = 0;
        this.kills = 0;
        this.roundsWon = 0;

        // Falling state
        this.isFalling = false;
        this.fallStartY = 0;
    }

    get currentWeapon() {
        return WEAPONS[this.selectedWeaponKey];
    }

    get currentWeaponKey() {
        return this.selectedWeaponKey;
    }

    placeOnTerrain(terrain, x) {
        this.x = x;
        this.surfaceY = terrain.getSurfaceY(x);
        this.terrainAngle = terrain.getAngleAt(x);
    }

    updatePosition(terrain) {
        const newSurfaceY = terrain.getSurfaceY(this.x);
        if (Math.abs(newSurfaceY - this.surfaceY) > 1) {
            if (newSurfaceY > this.surfaceY) {
                // Tank needs to fall
                this.isFalling = true;
                this.fallStartY = this.surfaceY;
            }
            this.surfaceY = newSurfaceY;
            this.terrainAngle = terrain.getAngleAt(this.x);
        }
    }

    applyFallDamage() {
        if (!this.isFalling) return 0;
        this.isFalling = false;

        const fallDist = this.surfaceY - this.fallStartY;
        if (fallDist <= FALL_DAMAGE_THRESHOLD) return 0;

        if (this.hasParachute) {
            this.hasParachute = false;
            return 0;
        }

        const dmg = Math.floor((fallDist - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_PIXEL);
        this.takeDamage(dmg);
        return dmg;
    }

    takeDamage(amount) {
        if (this.shieldHP > 0) {
            const absorbed = Math.min(this.shieldHP, amount);
            this.shieldHP -= absorbed;
            amount -= absorbed;
        }
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            this.alive = false;
        }
        return amount;
    }

    adjustAngle(delta) {
        this.aimAngle = clamp(this.aimAngle + delta, 0, 180);
    }

    adjustPower(delta) {
        this.power = clamp(this.power + delta, MIN_POWER, MAX_POWER);
    }

    selectNextWeapon() {
        const keys = this.getAvailableWeaponKeys();
        const idx = keys.indexOf(this.selectedWeaponKey);
        this.selectedWeaponKey = keys[(idx + 1) % keys.length];
    }

    selectPrevWeapon() {
        const keys = this.getAvailableWeaponKeys();
        const idx = keys.indexOf(this.selectedWeaponKey);
        this.selectedWeaponKey = keys[(idx - 1 + keys.length) % keys.length];
    }

    getAvailableWeaponKeys() {
        return Object.keys(this.weapons).filter(k => this.weapons[k] > 0);
    }

    consumeWeapon() {
        const key = this.selectedWeaponKey;
        if (key === 'basic') return; // infinite
        if (this.weapons[key] !== Infinity) {
            this.weapons[key]--;
            if (this.weapons[key] <= 0) {
                delete this.weapons[key];
                this.selectedWeaponKey = 'basic';
            }
        }
    }

    buyWeapon(key, price) {
        if (this.money < price) return false;
        this.money -= price;
        this.weapons[key] = (this.weapons[key] || 0) + 1;
        return true;
    }

    buyItem(key, item) {
        if (this.money < item.price) return false;
        this.money -= item.price;

        switch (key) {
            case 'parachute':
                this.hasParachute = true;
                break;
            case 'shield':
                this.shieldHP += item.shieldHP;
                break;
            case 'fuel':
                this.fuel += item.fuelAmount;
                break;
            case 'battery':
                this.hasBattery = true;
                break;
        }
        return true;
    }

    move(direction, terrain) {
        if (this.fuel <= 0) return;
        const step = direction; // -1 or +1
        const newX = clamp(this.x + step, TANK_WIDTH, CANVAS_WIDTH - TANK_WIDTH);
        this.fuel -= 0.5;
        this.x = newX;
        this.surfaceY = terrain.getSurfaceY(newX);
        this.terrainAngle = terrain.getAngleAt(newX);
    }

    getFireVelocity() {
        const rad = this.aimAngle * Math.PI / 180;
        let power = this.power;
        if (this.hasBattery) {
            power *= 1.2;
            this.hasBattery = false;
        }
        return {
            vx: Math.cos(rad) * power,
            vy: -Math.sin(rad) * power
        };
    }

    getMuzzlePosition(terrain) {
        const rad = this.aimAngle * Math.PI / 180;
        // Barrel starts at dome center (x, surfaceY - TANK_HEIGHT) and extends TANK_TURRET_LENGTH
        const domeX = this.x;
        const domeY = this.surfaceY - TANK_HEIGHT;
        let mx = domeX + Math.cos(rad) * TANK_TURRET_LENGTH;
        let my = domeY - Math.sin(rad) * TANK_TURRET_LENGTH;
        // Ensure muzzle is above terrain
        if (terrain) {
            const surfaceY = terrain.getSurfaceY(mx);
            if (my > surfaceY - 5) {
                my = surfaceY - 5;
            }
        }
        return { x: mx, y: my };
    }

    reset() {
        this.health = TANK_MAX_HEALTH;
        this.alive = true;
        this.isFalling = false;
        this.shieldHP = 0;
        this.fuel = 20;
        this.hasBattery = false;
        // Keep weapons, money, score, parachute between rounds
    }
}
