// main.js - Bootstrap, game loop

import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { Game, STATE } from './game.js';

const canvas = document.getElementById('game-canvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const game = new Game(canvas);
game.init();

// --- Mobile support ---

function detectTouchDevice() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
        document.body.classList.add('touch-device');
    }
    return isTouch;
}

const isTouchDevice = detectTouchDevice();

// Resume audio context on first touch (mobile browsers block autoplay)
if (isTouchDevice) {
    const resumeAudio = () => {
        if (game.audio && game.audio.ctx && game.audio.ctx.state === 'suspended') {
            game.audio.ctx.resume();
        }
        document.removeEventListener('touchstart', resumeAudio);
    };
    document.addEventListener('touchstart', resumeAudio, { once: true });
}

// Toggle touch controls visibility based on game state
function updateTouchControlsVisibility() {
    if (!isTouchDevice) return;
    const showControls = game.state === STATE.AIMING;
    document.body.classList.toggle('touch-controls-hidden', !showControls);
}

// --- Game loop ---

let lastTime = 0;

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // Cap dt at 50ms
    lastTime = timestamp;

    game.update(dt);
    game.render();
    updateTouchControlsVisibility();

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame((timestamp) => {
    lastTime = timestamp;
    gameLoop(timestamp);
});

// Prevent accidental page refresh during active gameplay
window.addEventListener('beforeunload', (e) => {
    if (game.isActiveGameState) {
        e.preventDefault();
    }
});
