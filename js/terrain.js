// terrain.js - Terrain generation, destruction, and modification

import { CANVAS_WIDTH, CANVAS_HEIGHT, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT, TERRAIN_ROUGHNESS, TERRAIN_THEMES } from './constants.js';
import { randRange, lerp, clamp, randInt } from './utils.js';

export class Terrain {
    constructor() {
        this.heightmap = new Float64Array(CANVAS_WIDTH);
        this.theme = TERRAIN_THEMES[0];
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = CANVAS_WIDTH;
        this.offscreenCanvas.height = CANVAS_HEIGHT;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.dirty = true;
        this.dirtyColumns = new Set();
    }

    generate() {
        this.theme = TERRAIN_THEMES[randInt(0, TERRAIN_THEMES.length - 1)];
        this._midpointDisplacement();
        this._smoothTerrain(3);
        this.dirty = true;
        this.dirtyColumns.clear();
        this._renderOffscreen();
    }

    _midpointDisplacement() {
        const hm = this.heightmap;
        const n = CANVAS_WIDTH;

        // Set endpoints
        hm[0] = randRange(TERRAIN_MIN_HEIGHT + 50, TERRAIN_MAX_HEIGHT - 50);
        hm[n - 1] = randRange(TERRAIN_MIN_HEIGHT + 50, TERRAIN_MAX_HEIGHT - 50);

        let step = n - 1;
        let roughness = TERRAIN_ROUGHNESS;
        let range = TERRAIN_MAX_HEIGHT - TERRAIN_MIN_HEIGHT;

        while (step > 1) {
            const halfStep = Math.floor(step / 2);
            for (let i = 0; i < n - 1; i += step) {
                const mid = i + halfStep;
                if (mid < n) {
                    const right = Math.min(i + step, n - 1);
                    hm[mid] = (hm[i] + hm[right]) / 2 + randRange(-range * roughness, range * roughness);
                    hm[mid] = clamp(hm[mid], TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
                }
            }
            range *= roughness;
            step = halfStep;
        }
    }

    _smoothTerrain(passes) {
        for (let p = 0; p < passes; p++) {
            const temp = new Float64Array(this.heightmap);
            for (let i = 1; i < CANVAS_WIDTH - 1; i++) {
                temp[i] = (this.heightmap[i - 1] + this.heightmap[i] + this.heightmap[i + 1]) / 3;
            }
            this.heightmap.set(temp);
        }
    }

    getHeight(x) {
        const ix = Math.floor(clamp(x, 0, CANVAS_WIDTH - 1));
        return this.heightmap[ix];
    }

    // Get surface Y coordinate (from top of canvas)
    getSurfaceY(x) {
        return CANVAS_HEIGHT - this.getHeight(x);
    }

    // Get terrain angle at position (for tank orientation)
    getAngleAt(x) {
        const x0 = clamp(Math.floor(x) - 2, 0, CANVAS_WIDTH - 1);
        const x1 = clamp(Math.floor(x) + 2, 0, CANVAS_WIDTH - 1);
        const dy = this.heightmap[x1] - this.heightmap[x0];
        const dx = x1 - x0;
        return Math.atan2(-dy, dx); // Negative because canvas Y is inverted
    }

    destroyCircle(cx, cy, radius) {
        // cx, cy in canvas coordinates; convert cy to height
        const centerHeight = CANVAS_HEIGHT - cy;
        const left = Math.max(0, Math.floor(cx - radius));
        const right = Math.min(CANVAS_WIDTH - 1, Math.ceil(cx + radius));

        for (let x = left; x <= right; x++) {
            const dx = x - cx;
            const colRadius = Math.sqrt(radius * radius - dx * dx);
            const destroyTop = centerHeight + colRadius;
            const destroyBottom = centerHeight - colRadius;

            if (this.heightmap[x] > destroyBottom) {
                if (this.heightmap[x] <= destroyTop) {
                    // Terrain surface is within destruction zone
                    this.heightmap[x] = Math.max(0, destroyBottom);
                }
                // If terrain is above destroy zone, carve a tunnel (just lower it)
                // For simplicity with 1D heightmap, only lower terrain
            }
            this.dirtyColumns.add(x);
        }
        this.dirty = true;
    }

    addTerrain(cx, cy, radius) {
        const centerHeight = CANVAS_HEIGHT - cy;
        const left = Math.max(0, Math.floor(cx - radius));
        const right = Math.min(CANVAS_WIDTH - 1, Math.ceil(cx + radius));

        for (let x = left; x <= right; x++) {
            const dx = x - cx;
            const addHeight = Math.sqrt(Math.max(0, radius * radius - dx * dx));
            this.heightmap[x] = clamp(this.heightmap[x] + addHeight, 0, CANVAS_HEIGHT - 10);
            this.dirtyColumns.add(x);
        }
        this.dirty = true;
    }

    _renderOffscreen() {
        const ctx = this.offscreenCtx;
        const topColor = this._parseColor(this.theme.top);
        const bottomColor = this._parseColor(this.theme.bottom);

        if (this.dirtyColumns.size > 0 && this.dirtyColumns.size < CANVAS_WIDTH / 2) {
            // Partial update - only redraw dirty columns
            for (const x of this.dirtyColumns) {
                this._renderColumn(ctx, x, topColor, bottomColor);
            }
        } else {
            // Full redraw
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            for (let x = 0; x < CANVAS_WIDTH; x++) {
                this._renderColumn(ctx, x, topColor, bottomColor);
            }
        }
        this.dirtyColumns.clear();
        this.dirty = false;
    }

    _renderColumn(ctx, x, topColor, bottomColor) {
        const h = this.heightmap[x];
        const surfaceY = CANVAS_HEIGHT - h;

        // Clear this column
        ctx.clearRect(x, 0, 1, CANVAS_HEIGHT);

        if (h <= 0) return;

        const sy = Math.floor(surfaceY);
        const colHeight = CANVAS_HEIGHT - sy;

        // Draw terrain column with linear gradient
        const gradient = ctx.createLinearGradient(x, sy, x, CANVAS_HEIGHT);
        gradient.addColorStop(0, `rgb(${topColor.r},${topColor.g},${topColor.b})`);
        gradient.addColorStop(1, `rgb(${bottomColor.r},${bottomColor.g},${bottomColor.b})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, sy, 1, colHeight);

        // Surface highlight (top 2 pixels brighter)
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x, sy, 1, 2);
    }

    _parseColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }

    render(ctx) {
        if (this.dirty || this.dirtyColumns.size > 0) {
            this._renderOffscreen();
        }
        ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // Find safe positions for placing tanks (flat-ish areas)
    findTankPositions(count) {
        const positions = [];
        const margin = 80;
        const spacing = (CANVAS_WIDTH - margin * 2) / (count + 1);

        for (let i = 0; i < count; i++) {
            const baseX = margin + spacing * (i + 1);
            // Find flattest spot near baseX
            let bestX = baseX;
            let bestFlatness = Infinity;
            for (let x = baseX - 40; x <= baseX + 40; x++) {
                if (x < margin || x > CANVAS_WIDTH - margin) continue;
                const flatness = Math.abs(this.heightmap[Math.floor(x) - 5] - this.heightmap[Math.floor(x) + 5]);
                if (flatness < bestFlatness) {
                    bestFlatness = flatness;
                    bestX = x;
                }
            }
            positions.push(Math.floor(bestX));
        }
        return positions;
    }
}
