// 서버(server/index.js, CommonJS)와 클라이언트(client/src/config.js, ES Module)가
// 동일한 값을 쓰도록 맞춰야 하는 공용 상수. 브라우저는 번들러 없이 순수 ES Module을
// 쓰고 서버는 CommonJS라 파일 하나를 공유할 수 없으므로, 값을 바꿀 땐 이 파일과
// client/src/config.js 양쪽을 함께 수정할 것.

module.exports = {
  TILE_SIZE: 32,
  PLAYER_SPEED: 200, // px/sec
  MOVE_SEND_INTERVAL_MS: 50,

  // 원거리 무기(활)로 쏜 화살. 서버가 매 tick 위치를 계산해 몬스터 명중을 판정하고,
  // 클라이언트는 같은 속도로 로컬 시각 시뮬레이션만 한다(위치를 매 tick 받지 않음).
  ARROW_SPEED: 600, // px/sec
  ARROW_LIFETIME_MS: 1200,

  // 시작의 섬 규칙: 레벨 10 미만은 바다(WATER) 타일에 충돌 처리되어 진입 불가.
  // 레벨 10 이상은 진입은 가능하지만 이동 속도가 느려진다(배 없이 헤엄치는 느낌).
  LEVEL_REQUIRED_FOR_SEA: 10,
  WATER_SPEED_MULTIPLIER: 0.5,

  // 상점은 이 반경(px) 안에 있을 때만 구매/판매 가능 (서버가 authoritative하게 검증)
  SHOP_INTERACT_RADIUS: 96,

  // GRASS_EDGE/DIRT_EDGE는 실제 지형이 아니라 풀-흙 경계를 부드럽게 보이게 하는
  // 디더(반점) 텍스처용 시각 전용 타일. 충돌/이동 판정은 GRASS·DIRT와 동일하게 취급한다.
  TILE_TYPES: { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3, GRASS_EDGE: 4, DIRT_EDGE: 5 },

  // 나무/바위/수풀 같은 정적 장애물. 플레이어 이동을 막고(엄폐), 화살도 막는다.
  OBSTACLE_RADIUS: 14,
};
