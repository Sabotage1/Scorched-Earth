// constants.js - All game configuration

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 700;

// Physics
export const GRAVITY = 300;          // pixels/sec^2
export const MAX_POWER = 500;
export const MIN_POWER = 50;
export const WIND_MAX = 80;          // max wind force
export const PHYSICS_SUBSTEPS = 4;
export const PROJECTILE_SPEED_SCALE = 1.0;
export const FALL_DAMAGE_THRESHOLD = 30;  // pixels before fall damage starts
export const FALL_DAMAGE_PER_PIXEL = 0.8;

// Tank
export const TANK_WIDTH = 24;
export const TANK_HEIGHT = 12;
export const TANK_TURRET_LENGTH = 18;
export const TANK_TURRET_WIDTH = 3;
export const TANK_MAX_HEALTH = 100;
export const TANK_MOVE_SPEED = 60;     // pixels per fuel unit
export const TANK_FUEL_DEFAULT = 0;

// Terrain
export const TERRAIN_MIN_HEIGHT = 80;
export const TERRAIN_MAX_HEIGHT = 500;
export const TERRAIN_ROUGHNESS = 0.25;

// Scoring
export const KILL_BONUS = 5000;
export const DAMAGE_SCORE_MULTIPLIER = 20;
export const ROUND_WIN_BONUS = 3000;
export const SURVIVAL_BONUS = 1000;
export const STARTING_MONEY = 10000;

// Timing
export const TURN_TRANSITION_DELAY = 400;
export const AI_THINK_DELAY = 400;
export const AI_AIM_DURATION = 800;
export const EXPLOSION_DURATION = 600;
export const ROUND_END_DELAY = 2000;

// HUD
export const HUD_HEIGHT = 50;
export const HEALTH_BAR_WIDTH = 30;
export const HEALTH_BAR_HEIGHT = 4;
export const HEALTH_BAR_OFFSET = 20;

// Player colors
export const PLAYER_COLORS = [
    { main: '#e74c3c', dark: '#c0392b', light: '#ff6b6b', name: 'Red' },
    { main: '#3498db', dark: '#2980b9', light: '#5dade2', name: 'Blue' },
    { main: '#2ecc71', dark: '#27ae60', light: '#58d68d', name: 'Green' },
    { main: '#f39c12', dark: '#e67e22', light: '#f5b041', name: 'Orange' }
];

// Weapons registry
export const WEAPONS = {
    basic: {
        name: 'Basic Shot',
        price: 0,
        blastRadius: 20,
        damage: 25,
        description: 'Standard projectile',
        infinite: true,
        type: 'projectile'
    },
    bigshot: {
        name: 'Big Shot',
        price: 2000,
        blastRadius: 40,
        damage: 40,
        description: 'Larger explosion',
        type: 'projectile'
    },
    mirv: {
        name: 'MIRV',
        price: 8000,
        blastRadius: 18,
        damage: 20,
        description: 'Splits into 5 bomblets at apex',
        bombletCount: 5,
        type: 'mirv'
    },
    napalm: {
        name: 'Napalm',
        price: 6000,
        blastRadius: 15,
        damage: 10,
        description: 'Fire flows downhill, burns over time',
        burnDuration: 3000,
        particleCount: 30,
        type: 'napalm'
    },
    dirtbomb: {
        name: 'Dirt Bomb',
        price: 3000,
        blastRadius: 30,
        damage: 5,
        description: 'Adds terrain instead of destroying',
        type: 'dirtbomb'
    },
    roller: {
        name: 'Roller',
        price: 4000,
        blastRadius: 25,
        damage: 30,
        description: 'Rolls along terrain surface',
        rollSpeed: 120,
        rollDuration: 3000,
        type: 'roller'
    },
    laser: {
        name: 'Laser',
        price: 10000,
        blastRadius: 12,
        damage: 50,
        description: 'Instant beam, ignores wind',
        type: 'laser'
    },
    nuke: {
        name: 'Nuke',
        price: 25000,
        blastRadius: 80,
        damage: 70,
        description: 'Massive explosion',
        type: 'nuke'
    }
};

// Shop items
export const SHOP_ITEMS = {
    parachute: {
        name: 'Parachute',
        price: 3000,
        description: 'Prevents fall damage',
        type: 'utility',
        stackable: true
    },
    shield: {
        name: 'Shield',
        price: 5000,
        description: 'Absorbs 50 damage',
        shieldHP: 50,
        type: 'utility',
        stackable: true
    },
    fuel: {
        name: 'Fuel',
        price: 2000,
        description: 'Move tank before firing',
        fuelAmount: 60,
        type: 'utility',
        stackable: true
    },
    battery: {
        name: 'Battery',
        price: 1500,
        description: '+20% power for one round',
        powerBoost: 0.2,
        type: 'utility',
        stackable: true
    }
};

// Sky themes
export const SKY_THEMES = [
    { top: '#0a0a2e', bottom: '#1a1a4e', name: 'Night' },
    { top: '#ff7e5f', bottom: '#feb47b', name: 'Sunset' },
    { top: '#1e3c72', bottom: '#2a5298', name: 'Deep Blue' },
    { top: '#232526', bottom: '#414345', name: 'Overcast' },
    { top: '#200122', bottom: '#6f0000', name: 'Blood Sky' },
    { top: '#0f2027', bottom: '#2c5364', name: 'Teal' }
];

// Terrain color themes
export const TERRAIN_THEMES = [
    { top: '#4a7c3f', bottom: '#2d1a0e', name: 'Grassland' },
    { top: '#c2b280', bottom: '#8b7355', name: 'Desert' },
    { top: '#e8e8e8', bottom: '#6e6e6e', name: 'Snow' },
    { top: '#8b4513', bottom: '#3e1a00', name: 'Mars' },
    { top: '#556b2f', bottom: '#1a1a0e', name: 'Forest' }
];
