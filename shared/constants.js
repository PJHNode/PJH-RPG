// 서버(server/index.js, CommonJS)와 클라이언트(client/src/config.js, ES Module)가
// 동일한 값을 쓰도록 맞춰야 하는 공용 상수. 브라우저는 번들러 없이 순수 ES Module을
// 쓰고 서버는 CommonJS라 파일 하나를 공유할 수 없으므로, 값을 바꿀 땐 이 파일과
// client/src/config.js 양쪽을 함께 수정할 것.

module.exports = {
  WORLD_WIDTH: 2000,
  WORLD_HEIGHT: 2000,
  PLAYER_SPEED: 200, // px/sec
  BULLET_SPEED: 500, // px/sec
  BULLET_LIFETIME_MS: 1500,
  MOVE_SEND_INTERVAL_MS: 50,
};
