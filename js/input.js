// input.js - Keyboard + touch input handling

export class Input {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._activeTouches = new Map(); // touchId → keyCode
    }

    // Map touch button data-action → key code
    static TOUCH_ACTION_MAP = {
        'angle-up':    'ArrowLeft',
        'angle-down':  'ArrowRight',
        'move-left':   'KeyA',
        'move-right':  'KeyD',
        'power-up':    'ArrowUp',
        'power-down':  'ArrowDown',
        'fire':        'Space',
        'weapon':      'KeyE'
    };

    init() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        this._setupTouchControls();
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        // Clear any stuck touch states
        for (const code of this._activeTouches.values()) {
            this.keys[code] = false;
        }
        this._activeTouches.clear();
    }

    _setupTouchControls() {
        const container = document.getElementById('touch-controls');
        if (!container) return;

        const onTouchStart = (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const btn = touch.target.closest('.touch-btn');
                if (!btn) continue;
                const action = btn.dataset.action;
                const code = Input.TOUCH_ACTION_MAP[action];
                if (!code) continue;
                this._activeTouches.set(touch.identifier, code);
                if (!this.keys[code]) {
                    this.justPressed[code] = true;
                }
                this.keys[code] = true;
                btn.classList.add('active');
            }
        };

        const onTouchEnd = (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const code = this._activeTouches.get(touch.identifier);
                if (!code) continue;
                this._activeTouches.delete(touch.identifier);
                // Only release key if no other touch is holding the same code
                let stillHeld = false;
                for (const c of this._activeTouches.values()) {
                    if (c === code) { stillHeld = true; break; }
                }
                if (!stillHeld) {
                    this.keys[code] = false;
                }
                // Remove active class from the button
                const btn = document.querySelector(`.touch-btn[data-action="${this._codeToAction(code)}"]`);
                if (btn) btn.classList.remove('active');
            }
        };

        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchend', onTouchEnd, { passive: false });
        container.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    _codeToAction(code) {
        for (const [action, c] of Object.entries(Input.TOUCH_ACTION_MAP)) {
            if (c === code) return action;
        }
        return null;
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
