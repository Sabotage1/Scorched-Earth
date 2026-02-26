// particles.js - Particle system: explosions, debris, smoke, fire, trails

import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants.js';
import { randRange, randInt, lerp, clamp } from './utils.js';

class Particle {
    constructor(x, y, vx, vy, life, color, size, type = 'normal') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
        this.type = type;
        this.alpha = 1;
        this.gravity = type === 'smoke' ? -30 : (type === 'fire' ? -20 : 150);
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    get hasActive() {
        return this.particles.length > 0;
    }

    update(dt, terrain) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Alpha fade
            p.alpha = clamp(p.life / p.maxLife, 0, 1);

            // Size shrink for some types
            if (p.type === 'smoke') {
                p.size *= 1 + dt;
            }

            // Terrain collision for debris
            if (p.type === 'debris' && terrain) {
                const surfaceY = terrain.getSurfaceY(p.x);
                if (p.y >= surfaceY) {
                    p.y = surfaceY;
                    p.vy = -p.vy * 0.3;
                    p.vx *= 0.7;
                    if (Math.abs(p.vy) < 5) {
                        p.vy = 0;
                        p.vx = 0;
                        p.gravity = 0;
                    }
                }
            }

            // Napalm follows terrain
            if (p.type === 'napalm' && terrain) {
                const surfaceY = terrain.getSurfaceY(p.x);
                if (p.y >= surfaceY - 2) {
                    p.y = surfaceY - 2;
                    p.vy = 0;
                    // Flow downhill
                    if (p.x > 0 && p.x < CANVAS_WIDTH) {
                        const hLeft = terrain.getHeight(Math.max(0, p.x - 3));
                        const hRight = terrain.getHeight(Math.min(CANVAS_WIDTH - 1, p.x + 3));
                        if (hLeft > hRight) {
                            p.vx = lerp(p.vx, 40, dt * 2);
                        } else if (hRight > hLeft) {
                            p.vx = lerp(p.vx, -40, dt * 2);
                        } else {
                            p.vx *= 0.95;
                        }
                    }
                }
            }

            // Bounds
            if (p.x < 0 || p.x > CANVAS_WIDTH || p.y > CANVAS_HEIGHT + 20) {
                this.particles.splice(i, 1);
            }
        }
    }

    render(ctx) {
        for (const p of this.particles) {
            ctx.globalAlpha = p.alpha;

            if (p.type === 'smoke') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'fire' || p.type === 'napalm') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
                ctx.fill();
                // Glow
                ctx.fillStyle = `rgba(255,200,50,${p.alpha * 0.3})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 2 * p.alpha, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'debris') {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    // Spawn explosion particles
    spawnExplosion(x, y, radius, color = null) {
        const count = Math.floor(radius * 2);

        // Fire burst
        for (let i = 0; i < count; i++) {
            const angle = randRange(0, Math.PI * 2);
            const speed = randRange(30, radius * 4);
            const c = color || `hsl(${randInt(10, 50)},100%,${randInt(40, 70)}%)`;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                randRange(0.2, 0.6),
                c,
                randRange(2, 5),
                'fire'
            ));
        }

        // Debris
        for (let i = 0; i < count / 2; i++) {
            const angle = randRange(0, Math.PI * 2);
            const speed = randRange(50, radius * 6);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - randRange(50, 150),
                randRange(0.5, 1.5),
                `hsl(${randInt(20, 40)},${randInt(30, 60)}%,${randInt(20, 50)}%)`,
                randRange(1, 3),
                'debris'
            ));
        }

        // Smoke
        for (let i = 0; i < count / 3; i++) {
            const angle = randRange(0, Math.PI * 2);
            const speed = randRange(10, 40);
            this.particles.push(new Particle(
                x + randRange(-radius / 2, radius / 2),
                y + randRange(-radius / 2, radius / 2),
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 20,
                randRange(0.8, 2.0),
                `rgba(${randInt(80, 120)},${randInt(80, 120)},${randInt(80, 120)},0.5)`,
                randRange(4, 10),
                'smoke'
            ));
        }
    }

    // Big nuke explosion
    spawnNukeExplosion(x, y, radius) {
        const count = radius * 3;

        // Massive fireball
        for (let i = 0; i < count; i++) {
            const angle = randRange(0, Math.PI * 2);
            const speed = randRange(50, radius * 5);
            const hue = randInt(0, 60);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                randRange(0.5, 1.5),
                `hsl(${hue},100%,${randInt(50, 80)}%)`,
                randRange(3, 8),
                'fire'
            ));
        }

        // Debris shower
        for (let i = 0; i < count; i++) {
            const angle = randRange(-Math.PI, 0);
            const speed = randRange(100, 400);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                randRange(1.0, 3.0),
                `hsl(${randInt(15, 45)},${randInt(40, 70)}%,${randInt(20, 50)}%)`,
                randRange(1, 4),
                'debris'
            ));
        }

        // Mushroom smoke
        for (let i = 0; i < count / 2; i++) {
            this.particles.push(new Particle(
                x + randRange(-radius, radius),
                y + randRange(-radius, 0),
                randRange(-20, 20),
                randRange(-80, -30),
                randRange(2.0, 4.0),
                `rgba(${randInt(60, 100)},${randInt(60, 100)},${randInt(60, 100)},0.4)`,
                randRange(8, 20),
                'smoke'
            ));
        }
    }

    // Napalm fire particles
    spawnNapalm(x, y, count) {
        for (let i = 0; i < count; i++) {
            const angle = randRange(0, Math.PI * 2);
            const speed = randRange(20, 80);
            this.particles.push(new Particle(
                x + randRange(-10, 10),
                y + randRange(-10, 10),
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 30,
                randRange(2.0, 4.0),
                `hsl(${randInt(10, 40)},100%,${randInt(40, 60)}%)`,
                randRange(3, 6),
                'napalm'
            ));
        }
    }

    // Trail effect
    spawnTrail(x, y) {
        this.particles.push(new Particle(
            x + randRange(-2, 2),
            y + randRange(-2, 2),
            randRange(-5, 5),
            randRange(-10, 0),
            randRange(0.1, 0.3),
            `rgba(200,200,200,0.4)`,
            randRange(1, 3),
            'smoke'
        ));
    }

    // Dirt bomb particles
    spawnDirt(x, y, radius) {
        for (let i = 0; i < 20; i++) {
            const angle = randRange(-Math.PI, 0);
            const speed = randRange(30, 100);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                randRange(0.3, 0.8),
                `hsl(${randInt(25, 40)},${randInt(40, 70)}%,${randInt(20, 40)}%)`,
                randRange(2, 4),
                'debris'
            ));
        }
    }

    clear() {
        this.particles = [];
    }
}
