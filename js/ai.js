// ai.js - AI with 3 difficulty levels, iterative trajectory solving

import { GRAVITY, WIND_MAX, MAX_POWER, MIN_POWER, WEAPONS, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { randRange, clamp, randInt } from './utils.js';

export class AI {
    constructor() {}

    calculateShot(tank, targets, terrain, wind, difficulty) {
        if (targets.length === 0) {
            return { angle: 45, power: 200, weaponKey: 'basic' };
        }

        const target = this._selectTarget(tank, targets, difficulty);
        const weaponKey = this._selectWeapon(tank, target, difficulty);

        // Solve trajectory
        const solution = this._solveTrajectory(tank, target, wind, terrain);

        // Add error based on difficulty
        const error = this._getErrorForDifficulty(difficulty);
        const angle = clamp(solution.angle + randRange(-error.angle, error.angle), 5, 175);
        const power = clamp(solution.power + randRange(-error.power, error.power), MIN_POWER, MAX_POWER);

        return { angle, power, weaponKey };
    }

    _selectTarget(tank, targets, difficulty) {
        switch (difficulty) {
            case 'easy':
                // Random target
                return targets[randInt(0, targets.length - 1)];

            case 'medium':
                // Closest target
                return targets.reduce((closest, t) => {
                    const d1 = Math.abs(t.x - tank.x);
                    const d2 = Math.abs(closest.x - tank.x);
                    return d1 < d2 ? t : closest;
                });

            case 'hard':
                // Weakest target (strategic)
                return targets.reduce((best, t) => {
                    const score = (100 - t.health) + (t.kills * 20); // Prefer weak + dangerous
                    const bestScore = (100 - best.health) + (best.kills * 20);
                    return score > bestScore ? t : best;
                });

            default:
                return targets[0];
        }
    }

    _selectWeapon(tank, target, difficulty) {
        if (difficulty === 'easy') return 'basic';

        const available = tank.getAvailableWeaponKeys();
        const dist = Math.abs(target.x - tank.x);

        if (difficulty === 'medium') {
            // Use whatever's available, prefer bigger damage
            const priorities = ['bigshot', 'basic'];
            for (const key of priorities) {
                if (available.includes(key)) return key;
            }
            return 'basic';
        }

        // Hard - strategic weapon selection
        if (available.includes('nuke') && dist < 400) return 'nuke';
        if (available.includes('laser') && dist < 300) return 'laser';
        if (available.includes('mirv') && dist > 200) return 'mirv';
        if (available.includes('napalm') && target.health < 40) return 'napalm';
        if (available.includes('bigshot')) return 'bigshot';
        if (available.includes('roller') && dist < 300) return 'roller';
        return 'basic';
    }

    _solveTrajectory(tank, target, wind, terrain) {
        // Iterative trajectory solver
        const dx = target.x - tank.x;
        const dy = target.surfaceY - (tank.surfaceY - 12); // Muzzle height offset

        // Initial estimate using basic projectile motion formula
        let bestAngle = 45;
        let bestPower = 250;
        let bestError = Infinity;

        // Try multiple angles and find best
        for (let angle = 15; angle <= 165; angle += 3) {
            const rad = angle * Math.PI / 180;
            const cosA = Math.cos(rad);
            const sinA = Math.sin(rad);

            // Estimate required power
            // Using: dx = vx*t, dy = vy*t + 0.5*g*t^2
            // vx = power * cos(a), vy = -power * sin(a)
            if (Math.abs(cosA) < 0.01) continue;

            // Try different powers
            for (let power = MIN_POWER; power <= MAX_POWER; power += 20) {
                const vx = cosA * power;
                const vy = -sinA * power;

                // Simulate trajectory
                let sx = tank.x + cosA * 20; // Muzzle offset
                let sy = tank.surfaceY - 12 - sinA * 20;
                let svx = vx;
                let svy = vy;
                const simDt = 0.02;
                let hit = false;

                for (let t = 0; t < 10; t += simDt) {
                    svx += wind * simDt;
                    svy += GRAVITY * simDt;
                    sx += svx * simDt;
                    sy += svy * simDt;

                    // Check if hit terrain near target
                    if (sy >= terrain.getSurfaceY(sx) || sy >= CANVAS_HEIGHT) {
                        const err = Math.sqrt((sx - target.x) ** 2 + (sy - target.surfaceY) ** 2);
                        if (err < bestError) {
                            bestError = err;
                            bestAngle = angle;
                            bestPower = power;
                        }
                        hit = true;
                        break;
                    }

                    // Off screen
                    if (sx < -100 || sx > CANVAS_WIDTH + 100) break;
                }
            }
        }

        // Refine with finer search around best
        const refineAngleRange = 5;
        const refinePowerRange = 40;
        for (let angle = bestAngle - refineAngleRange; angle <= bestAngle + refineAngleRange; angle += 0.5) {
            for (let power = bestPower - refinePowerRange; power <= bestPower + refinePowerRange; power += 5) {
                if (power < MIN_POWER || power > MAX_POWER) continue;
                const rad = angle * Math.PI / 180;
                const cosA = Math.cos(rad);
                const sinA = Math.sin(rad);
                const vx = cosA * power;
                const vy = -sinA * power;

                let sx = tank.x + cosA * 20;
                let sy = tank.surfaceY - 12 - sinA * 20;
                let svx = vx;
                let svy = vy;
                const simDt = 0.01;

                for (let t = 0; t < 10; t += simDt) {
                    svx += wind * simDt;
                    svy += GRAVITY * simDt;
                    sx += svx * simDt;
                    sy += svy * simDt;

                    if (sy >= terrain.getSurfaceY(sx) || sy >= CANVAS_HEIGHT) {
                        const err = Math.sqrt((sx - target.x) ** 2 + (sy - target.surfaceY) ** 2);
                        if (err < bestError) {
                            bestError = err;
                            bestAngle = angle;
                            bestPower = power;
                        }
                        break;
                    }
                    if (sx < -100 || sx > CANVAS_WIDTH + 100) break;
                }
            }
        }

        return { angle: bestAngle, power: bestPower };
    }

    _getErrorForDifficulty(difficulty) {
        switch (difficulty) {
            case 'easy':
                return { angle: 20, power: 80 };
            case 'medium':
                return { angle: 8, power: 30 };
            case 'hard':
                return { angle: 2, power: 10 };
            default:
                return { angle: 15, power: 60 };
        }
    }
}
