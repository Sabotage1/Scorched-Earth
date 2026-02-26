// main.js - Bootstrap, game loop

import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const game = new Game(canvas);
game.init();

let lastTime = 0;

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // Cap dt at 50ms
    lastTime = timestamp;

    game.update(dt);
    game.render();

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame((timestamp) => {
    lastTime = timestamp;
    gameLoop(timestamp);
});
