// 서버(server/index.js, CommonJS)와 클라이언트(client/src/config.js, ES Module)가
// 동일한 값을 쓰도록 맞춰야 하는 공용 상수. 브라우저는 번들러 없이 순수 ES Module을
// 쓰고 서버는 CommonJS라 파일 하나를 공유할 수 없으므로, 값을 바꿀 땐 이 파일과
// client/src/config.js 양쪽을 함께 수정할 것.

module.exports = {
  TILE_SIZE: 32,
  PLAYER_SPEED: 200, // px/sec
  BULLET_SPEED: 500, // px/sec
  BULLET_LIFETIME_MS: 1500,
  MOVE_SEND_INTERVAL_MS: 50,

  // 시작의 섬 규칙: 레벨 10 미만은 바다(WATER) 타일에 충돌 처리되어 진입 불가.
  // 레벨 10 이상은 진입은 가능하지만 이동 속도가 느려진다(배 없이 헤엄치는 느낌).
  LEVEL_REQUIRED_FOR_SEA: 10,
  WATER_SPEED_MULTIPLIER: 0.5,

  TILE_TYPES: { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3 },
};
