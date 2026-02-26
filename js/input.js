// input.js - Keyboard input handling

export class Input {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    init() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    _onKeyDown(e) {
        if (!this.keys[e.code]) {
            this.justPressed[e.code] = true;
        }
        this.keys[e.code] = true;

        // Prevent default for game keys
        const gameKeys = [
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Space', 'Tab', 'Enter', 'KeyA', 'KeyD', 'KeyW', 'KeyS',
            'BracketLeft', 'BracketRight'
        ];
        if (gameKeys.includes(e.code)) {
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
    }

    isDown(code) {
        return !!this.keys[code];
    }

    wasPressed(code) {
        if (this.justPressed[code]) {
            this.justPressed[code] = false;
            return true;
        }
        return false;
    }

    clearJustPressed() {
        this.justPressed = {};
    }

    // Process input for current tank during aiming phase
    processAiming(tank, terrain, dt) {
        const angleSpeed = 45 * dt; // degrees per second
        const powerSpeed = 200 * dt;

        // Angle adjustment
        if (this.isDown('ArrowLeft')) {
            tank.adjustAngle(angleSpeed);
        }
        if (this.isDown('ArrowRight')) {
            tank.adjustAngle(-angleSpeed);
        }

        // Power adjustment
        if (this.isDown('ArrowUp')) {
            tank.adjustPower(powerSpeed);
        }
        if (this.isDown('ArrowDown')) {
            tank.adjustPower(-powerSpeed);
        }

        // Weapon cycling
        if (this.wasPressed('BracketRight') || this.wasPressed('KeyE')) {
            tank.selectNextWeapon();
        }
        if (this.wasPressed('BracketLeft') || this.wasPressed('KeyQ')) {
            tank.selectPrevWeapon();
        }

        // Tank movement (if has fuel)
        if (this.isDown('KeyA')) {
            tank.move(-1, terrain);
        }
        if (this.isDown('KeyD')) {
            tank.move(1, terrain);
        }

        // Fire
        if (this.wasPressed('Space') || this.wasPressed('Enter')) {
            return 'fire';
        }

        return null;
    }
}
