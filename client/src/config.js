// server/index.js가 require하는 shared/constants.js와 같은 값을 유지할 것.
// 브라우저는 번들러 없이 순수 ES Module을 쓰므로 파일을 공유하지 못해 값만 맞춘다.

export const WORLD = { width: 2000, height: 2000 };
export const PLAYER_SPEED = 200; // px/sec
export const BULLET_SPEED = 500; // px/sec
export const BULLET_LIFETIME_MS = 1500;
export const MOVE_SEND_INTERVAL_MS = 50;
