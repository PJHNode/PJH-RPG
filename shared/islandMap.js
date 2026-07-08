// 시작의 섬(레벨 1~10 성장 맵) 지형 생성. 서버에서만 실행되며, 생성된 2D 타일 배열은
// 클라이언트에 그대로 전송되어 렌더링에 쓰인다(클라이언트는 이 생성 로직을 갖지 않음).

const { TILE_TYPES } = require("./constants");

// 중심에서 섬 반지름 안쪽은 육지(잔디/흙/모래), 바깥쪽은 전부 바다.
function generateIslandMap({ cols, rows, islandRadius, coastBand }) {
  const cx = cols / 2;
  const cy = rows / 2;
  const data = [];

  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      row.push(tileForDistance(dist, islandRadius, coastBand, x, y));
    }
    data.push(row);
  }

  return data;
}

function tileForDistance(dist, islandRadius, coastBand, x, y) {
  if (dist > islandRadius) return TILE_TYPES.WATER;
  if (dist > islandRadius - coastBand) return TILE_TYPES.SAND;

  // 내륙: 잔디 위주에 흙 patch를 의사난수로 흩뿌림
  return pseudoNoise(x, y) > 0.82 ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
}

// 서버를 재시작해도 항상 같은 지형이 나오도록 시드 대신 좌표 기반 해시를 사용
function pseudoNoise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function isLandTile(tile) {
  return tile === TILE_TYPES.GRASS || tile === TILE_TYPES.DIRT || tile === TILE_TYPES.SAND;
}

module.exports = { generateIslandMap, isLandTile };
