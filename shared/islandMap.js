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

  applyGrassDirtBlend(data, rows, cols);

  return data;
}

// 흙 patch를 4x4 타일 블록 단위로 뭉치게 해서(좌표를 낮은 해상도로 양자화) 낱개 타일이
// 사방에 흩뿌려지는 대신 작은 덩어리로 모이게 한다 - 그래야 경계 디더 타일이 섬 전체를
// 뒤덮지 않고 실제 패치 가장자리에만 국한된다.
const DIRT_PATCH_BLOCK = 4;

function tileForDistance(dist, islandRadius, coastBand, x, y) {
  if (dist > islandRadius) return TILE_TYPES.WATER;
  if (dist > islandRadius - coastBand) return TILE_TYPES.SAND;

  const blockX = Math.floor(x / DIRT_PATCH_BLOCK);
  const blockY = Math.floor(y / DIRT_PATCH_BLOCK);
  return pseudoNoise(blockX, blockY) > 0.75 ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
}

// 풀-흙 경계가 각진 사각형으로 딱 잘리지 않도록, 서로 다른 타입과 맞닿은 타일을
// GRASS_EDGE/DIRT_EDGE(디더 무늬 렌더링용 시각 타일)로 바꿔 부드럽게 이어 보이게 한다.
// 판정은 원본 배열 기준으로만 해서 연쇄적으로 번지지 않게 한다.
function applyGrassDirtBlend(data, rows, cols) {
  const { GRASS, DIRT, GRASS_EDGE, DIRT_EDGE } = TILE_TYPES;
  const original = data.map((row) => row.slice());

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = original[y][x];
      if (tile !== GRASS && tile !== DIRT) continue;

      const other = tile === GRASS ? DIRT : GRASS;
      const neighbors = [original[y - 1]?.[x], original[y + 1]?.[x], original[y]?.[x - 1], original[y]?.[x + 1]];

      if (neighbors.includes(other)) {
        data[y][x] = tile === GRASS ? GRASS_EDGE : DIRT_EDGE;
      }
    }
  }
}

// 서버를 재시작해도 항상 같은 지형이 나오도록 시드 대신 좌표 기반 해시를 사용
function pseudoNoise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function isLandTile(tile) {
  return (
    tile === TILE_TYPES.GRASS ||
    tile === TILE_TYPES.DIRT ||
    tile === TILE_TYPES.SAND ||
    tile === TILE_TYPES.GRASS_EDGE ||
    tile === TILE_TYPES.DIRT_EDGE
  );
}

module.exports = { generateIslandMap, isLandTile };
