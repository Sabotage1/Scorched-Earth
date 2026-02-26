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

// Fullscreen toggle
if (isTouchDevice) {
    const fsBtn = document.getElementById('fullscreen-btn');
    const iosPrompt = document.getElementById('ios-fullscreen-prompt');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;

    if (fsBtn) {
        // Hide button if already running as PWA
        if (isIOS && isStandalone) {
            fsBtn.style.display = 'none';
        }

        fsBtn.addEventListener('click', () => {
            if (isIOS) {
                // iOS: show "Add to Home Screen" prompt
                if (iosPrompt) {
                    iosPrompt.classList.toggle('visible');
                }
            } else {
                // Android / other: use real Fullscreen API
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    const el = document.documentElement;
                    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
                } else {
                    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                }
            }
        });

        if (!isIOS) {
            const updateIcon = () => {
                const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
                fsBtn.textContent = isFS ? '\u2716' : '\u26F6';
            };
            document.addEventListener('fullscreenchange', updateIcon);
            document.addEventListener('webkitfullscreenchange', updateIcon);
        }
    }

    // Dismiss iOS prompt on tap
    if (iosPrompt) {
        iosPrompt.addEventListener('click', () => {
            iosPrompt.classList.remove('visible');
        });
    }
}

// Toggle touch controls visibility based on game state
function updateTouchControlsVisibility() {
    if (!isTouchDevice) return;
    const isLocalTurn = !game.online || game.currentPlayerIndex === game.online.localPlayerIndex;
    const currentTank = game.players && game.players[game.currentPlayerIndex];
    const isHumanTurn = currentTank && !currentTank.isAI;
    const showControls = game.state === STATE.AIMING && isLocalTurn && isHumanTurn;
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
