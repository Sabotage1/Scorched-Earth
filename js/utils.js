// utils.js - Math helpers, color utils, easing functions

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function randRange(min, max) {
    return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
    return Math.floor(randRange(min, max + 1));
}

export function degToRad(deg) {
    return deg * Math.PI / 180;
}

export function radToDeg(rad) {
    return rad * 180 / Math.PI;
}

export function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

export function rgbToStr(r, g, b, a = 1) {
    if (a < 1) return `rgba(${r|0},${g|0},${b|0},${a})`;
    return `rgb(${r|0},${g|0},${b|0})`;
}

export function hslToStr(h, s, l, a = 1) {
    if (a < 1) return `hsla(${h},${s}%,${l}%,${a})`;
    return `hsl(${h},${s}%,${l}%)`;
}

export function lerpColor(c1, c2, t) {
    return {
        r: lerp(c1.r, c2.r, t),
        g: lerp(c1.g, c2.g, t),
        b: lerp(c1.b, c2.b, t)
    };
}

// Easing functions
export function easeInQuad(t) { return t * t; }
export function easeOutQuad(t) { return t * (2 - t); }
export function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
export function easeOutCubic(t) { return (--t) * t * t + 1; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; }
export function easeOutBounce(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

// Angle normalization (0-360)
export function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

// Point in circle test
export function pointInCircle(px, py, cx, cy, r) {
    return dist(px, py, cx, cy) <= r;
}

// Simple shuffle
export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
