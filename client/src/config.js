// server/index.js가 require하는 shared/constants.js와 같은 값을 유지할 것.
// 브라우저는 번들러 없이 순수 ES Module을 쓰므로 파일을 공유하지 못해 값만 맞춘다.

export const TILE_SIZE = 32;
export const PLAYER_SPEED = 200; // px/sec
export const MOVE_SEND_INTERVAL_MS = 50;

export const ARROW_SPEED = 600; // px/sec
export const ARROW_LIFETIME_MS = 1200;

export const LEVEL_REQUIRED_FOR_SEA = 10;
export const WATER_SPEED_MULTIPLIER = 0.5;

export const SHOP_INTERACT_RADIUS = 96;

// GRASS_EDGE/DIRT_EDGE는 풀-흙 경계를 부드럽게 보이게 하는 디더 텍스처용 시각 전용 타일.
export const TILE_TYPES = { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3, GRASS_EDGE: 4, DIRT_EDGE: 5 };
