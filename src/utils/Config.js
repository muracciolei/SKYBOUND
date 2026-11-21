export const WORLD = {
  SIZE: 12000,
  HALF: 6000,
  SEA_LEVEL: 0,
  AIRPORT: {
    x: 0,
    z: 0,
    height: 24,
    runwayLength: 1100,
    runwayWidth: 64,
    heading: 0
  }
};

export const FLIGHT = {
  THRUST: 25,
  DRAG: 0.0019,
  LIFT: 0.0052,
  GRAVITY: 9.81,
  MAX_SPEED: 104,
  PITCH_RATE: 0.9,
  ROLL_RATE: 1.55,
  YAW_RATE: 0.58,
  GEAR_CLEARANCE: 2.45
};

export const QUALITY = {
  low: {
    label: 'LOW',
    pixelRatio: 1,
    shadows: false,
    shadowSize: 512,
    terrainSegments: 176,
    trees: 1100,
    rocks: 260,
    clouds: 950,
    stars: 400,
    oceanSegments: 48,
    fogFar: 6400
  },
  medium: {
    label: 'MEDIUM',
    pixelRatio: 1.35,
    shadows: true,
    shadowSize: 1024,
    terrainSegments: 264,
    trees: 2400,
    rocks: 520,
    clouds: 1700,
    stars: 650,
    oceanSegments: 72,
    fogFar: 8000
  },
  high: {
    label: 'HIGH',
    pixelRatio: 2,
    shadows: true,
    shadowSize: 2048,
    terrainSegments: 384,
    trees: 4200,
    rocks: 900,
    clouds: 2600,
    stars: 900,
    oceanSegments: 96,
    fogFar: 10500
  }
};

export const CAMERA_MODES = ['CHASE', 'THIRD', 'COCKPIT', 'FREE'];
