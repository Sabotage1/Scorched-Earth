// renderer.js - All canvas drawing: sky, terrain, tanks, projectiles, particles, HUD

import { CANVAS_WIDTH, CANVAS_HEIGHT, TANK_WIDTH, TANK_HEIGHT, TANK_TURRET_LENGTH,
         TANK_TURRET_WIDTH, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, HEALTH_BAR_OFFSET,
         PLAYER_COLORS, TANK_MAX_HEALTH, SKY_THEMES, HUD_HEIGHT } from './constants.js';
import { degToRad, lerp, rgbToStr, clamp } from './utils.js';
import { randInt } from './utils.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.skyTheme = SKY_THEMES[0];
        this.skyCanvas = document.createElement('canvas');
        this.skyCanvas.width = CANVAS_WIDTH;
        this.skyCanvas.height = CANVAS_HEIGHT;
        this._renderSky();

        // Screen shake
        this.shakeAmount = 0;
        this.shakeDecay = 5;

        // Flash
        this.flashAlpha = 0;
        this.flashDecay = 3;

        // Stars for night sky
        this.stars = [];
        this._generateStars();
    }

    _generateStars() {
        this.stars = [];
        for (let i = 0; i < 80; i++) {
            this.stars.push({
                x: Math.random() * CANVAS_WIDTH,
                y: Math.random() * CANVAS_HEIGHT * 0.6,
                size: Math.random() * 1.5 + 0.5,
                brightness: Math.random() * 0.5 + 0.5
            });
        }
    }

    randomizeSky() {
        this.skyTheme = SKY_THEMES[randInt(0, SKY_THEMES.length - 1)];
        this._renderSky();
    }

    _renderSky() {
        const ctx = this.skyCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        gradient.addColorStop(0, this.skyTheme.top);
        gradient.addColorStop(1, this.skyTheme.bottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    shake(amount) {
        this.shakeAmount = Math.max(this.shakeAmount, amount);
    }

    flash(alpha = 0.8) {
        this.flashAlpha = Math.max(this.flashAlpha, alpha);
    }

    clear() {
        this.ctx.drawImage(this.skyCanvas, 0, 0);

        // Draw stars if dark sky
        const topBrightness = this._colorBrightness(this.skyTheme.top);
        if (topBrightness < 60) {
            for (const star of this.stars) {
                this.ctx.fillStyle = `rgba(255,255,255,${star.brightness})`;
                this.ctx.beginPath();
                this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    _colorBrightness(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r + g + b) / 3;
    }

    applyShake(dt) {
        if (this.shakeAmount > 0.5) {
            const ox = (Math.random() - 0.5) * this.shakeAmount * 2;
            const oy = (Math.random() - 0.5) * this.shakeAmount * 2;
            this.ctx.save();
            this.ctx.translate(ox, oy);
            this.shakeAmount *= Math.exp(-this.shakeDecay * dt);
        }
    }

    restoreShake() {
        if (this.shakeAmount > 0.5) {
            this.ctx.restore();
        }
    }

    drawFlash(dt) {
        if (this.flashAlpha > 0.01) {
            this.ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
            this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.flashAlpha *= Math.exp(-this.flashDecay * dt);
        }
    }

    drawTank(tank, isActive = false) {
        if (!tank.alive) return;

        const ctx = this.ctx;
        const x = tank.x;
        const y = tank.surfaceY;
        const color = PLAYER_COLORS[tank.playerIndex];
        const angle = tank.terrainAngle || 0;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Tank body
        ctx.fillStyle = color.main;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-TANK_WIDTH / 2, -TANK_HEIGHT, TANK_WIDTH, TANK_HEIGHT, 3);
        } else {
            ctx.rect(-TANK_WIDTH / 2, -TANK_HEIGHT, TANK_WIDTH, TANK_HEIGHT);
        }
        ctx.fill();

        // Tank dome
        ctx.fillStyle = color.light;
        ctx.beginPath();
        ctx.arc(0, -TANK_HEIGHT, TANK_WIDTH / 3, Math.PI, 0);
        ctx.fill();

        // Turret - pivot at dome center, draw barrel extending outward
        ctx.save();
        ctx.translate(0, -TANK_HEIGHT); // Move to dome center
        // aimAngle: 0°=right, 90°=up, 180°=left
        // Canvas rotation: 0=right, negative=up. So rotate by -aimAngle.
        // Also compensate for terrain tilt since we're inside the terrain-rotated context.
        ctx.rotate(-tank.aimAngle * Math.PI / 180 - angle);
        ctx.fillStyle = color.dark;
        // Draw barrel extending along positive X axis from pivot
        ctx.fillRect(0, -TANK_TURRET_WIDTH / 2, TANK_TURRET_LENGTH, TANK_TURRET_WIDTH);
        ctx.restore();

        // Treads
        ctx.fillStyle = color.dark;
        ctx.fillRect(-TANK_WIDTH / 2 - 1, -3, TANK_WIDTH + 2, 3);

        ctx.restore();

        // Shield indicator
        if (tank.shieldHP > 0) {
            ctx.strokeStyle = 'rgba(100,200,255,0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y - TANK_HEIGHT / 2, TANK_WIDTH * 0.8, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Health bar
        this._drawHealthBar(ctx, x, y, tank.health);

        // Active indicator
        if (isActive) {
            ctx.fillStyle = color.main;
            const arrowY = y - TANK_HEIGHT - HEALTH_BAR_OFFSET - 15;
            ctx.beginPath();
            ctx.moveTo(x, arrowY + 8);
            ctx.lineTo(x - 5, arrowY);
            ctx.lineTo(x + 5, arrowY);
            ctx.closePath();
            ctx.fill();
        }

        // Player name
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(tank.name, x, y - TANK_HEIGHT - HEALTH_BAR_OFFSET - 18);
    }

    _drawHealthBar(ctx, x, y, health) {
        const barX = x - HEALTH_BAR_WIDTH / 2;
        const barY = y - TANK_HEIGHT - HEALTH_BAR_OFFSET;
        const healthPct = health / TANK_MAX_HEALTH;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

        // Health fill
        let color = '#2ecc71';
        if (healthPct < 0.3) color = '#e74c3c';
        else if (healthPct < 0.6) color = '#f39c12';

        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, HEALTH_BAR_WIDTH * healthPct, HEALTH_BAR_HEIGHT);

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    }

    drawProjectile(projectile) {
        const ctx = this.ctx;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Trail glow
        ctx.fillStyle = 'rgba(255,200,50,0.6)';
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawAimIndicator(tank) {
        if (!tank.alive) return;
        const ctx = this.ctx;
        const color = PLAYER_COLORS[tank.playerIndex];

        // Dotted aim line
        const aimRad = tank.aimAngle * Math.PI / 180;
        const lineLen = 40;
        const startX = tank.x;
        const startY = tank.surfaceY - TANK_HEIGHT;

        ctx.strokeStyle = `rgba(255,255,255,0.4)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(
            startX + Math.cos(aimRad) * lineLen,
            startY - Math.sin(aimRad) * lineLen
        );
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawHUD(gameState) {
        const ctx = this.ctx;
        const { currentPlayer, players, wind, roundNum, totalRounds } = gameState;

        // HUD background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);

        // Current player info
        if (currentPlayer != null && players[currentPlayer]) {
            const tank = players[currentPlayer];
            const color = PLAYER_COLORS[tank.playerIndex];

            ctx.fillStyle = color.main;
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${tank.name}'s Turn`, 15, 20);

            // Angle
            ctx.fillStyle = '#ccc';
            ctx.font = '13px monospace';
            ctx.fillText(`Angle: ${tank.aimAngle.toFixed(1)}°`, 15, 38);

            // Power
            const powerPct = ((tank.power - 50) / 450 * 100).toFixed(0);
            ctx.fillText(`Power: ${powerPct}%`, 170, 38);

            // Current weapon
            ctx.fillStyle = '#f1c40f';
            ctx.fillText(`[${tank.currentWeapon.name}]`, 170, 20);
        }

        // Wind indicator
        this._drawWindIndicator(ctx, CANVAS_WIDTH / 2, 25, wind);

        // Round info
        ctx.fillStyle = '#aaa';
        ctx.font = '13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Round ${roundNum}/${totalRounds}`, CANVAS_WIDTH - 15, 20);

        // Player scores summary
        let scoreX = CANVAS_WIDTH - 15;
        ctx.font = '11px monospace';
        for (let i = players.length - 1; i >= 0; i--) {
            const t = players[i];
            const text = `${t.name}: $${t.money}`;
            const w = ctx.measureText(text).width;
            scoreX -= w + 15;
            ctx.fillStyle = PLAYER_COLORS[t.playerIndex].main;
            ctx.textAlign = 'left';
            ctx.fillText(text, scoreX, 38);
        }
    }

    _drawWindIndicator(ctx, x, y, wind) {
        const maxWidth = 60;
        const barWidth = (Math.abs(wind) / 80) * maxWidth;
        const direction = wind > 0 ? 1 : -1;

        ctx.fillStyle = '#aaa';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WIND', x, y - 10);

        // Wind bar
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x - maxWidth, y - 3, maxWidth * 2, 6);

        const windColor = Math.abs(wind) > 50 ? '#e74c3c' : '#3498db';
        ctx.fillStyle = windColor;
        if (direction > 0) {
            ctx.fillRect(x, y - 3, barWidth, 6);
        } else {
            ctx.fillRect(x - barWidth, y - 3, barWidth, 6);
        }

        // Center mark
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - 5, 2, 10);
    }

    drawLaser(fromX, fromY, toX, toY, progress) {
        const ctx = this.ctx;
        const alpha = 1 - progress;

        // Outer glow
        ctx.strokeStyle = `rgba(255,50,50,${alpha * 0.3})`;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Inner beam
        ctx.strokeStyle = `rgba(255,200,200,${alpha * 0.8})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Core
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
    }

    drawPowerMeter(tank) {
        if (!tank.alive) return;
        const ctx = this.ctx;
        const x = tank.x + TANK_WIDTH;
        const y = tank.surfaceY - TANK_HEIGHT - 30;
        const height = 40;
        const width = 6;
        const pct = (tank.power - 50) / 450;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, width, height);

        const gradient = ctx.createLinearGradient(x, y + height, x, y);
        gradient.addColorStop(0, '#2ecc71');
        gradient.addColorStop(0.5, '#f1c40f');
        gradient.addColorStop(1, '#e74c3c');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y + height * (1 - pct), width, height * pct);

        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(x, y, width, height);
    }
}
