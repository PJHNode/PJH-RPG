import { TILE_TYPES } from "./config.js";

const canvas = document.getElementById("minimap");
const ctx = canvas.getContext("2d");
const SIZE = canvas.width;

const MINIMAP_COLORS = {
  [TILE_TYPES.GRASS]: "#3a6b3a",
  [TILE_TYPES.DIRT]: "#6b4f31",
  [TILE_TYPES.SAND]: "#cbb26a",
  [TILE_TYPES.WATER]: "#2a5d8f",
};

let terrainCanvas = null;
let worldWidth = 0;
let worldHeight = 0;

// 지형은 접속 시 한 번만 축소해서 그려두고, 매 프레임에는 위에 점만 덧그린다.
export function buildMinimapTerrain(mapPayload) {
  const { width, height, mapData } = mapPayload;
  worldWidth = width;
  worldHeight = height;

  const rows = mapData.length;
  const cols = mapData[0].length;
  const cellW = SIZE / cols;
  const cellH = SIZE / rows;

  terrainCanvas = document.createElement("canvas");
  terrainCanvas.width = SIZE;
  terrainCanvas.height = SIZE;
  const tctx = terrainCanvas.getContext("2d");

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      tctx.fillStyle = MINIMAP_COLORS[mapData[y][x]] ?? "#000000";
      tctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
    }
  }
}

export function renderMinimap({ localPos, shopPos, remotePositions }) {
  if (!terrainCanvas) return;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(terrainCanvas, 0, 0);

  const toMini = (x, y) => [(x / worldWidth) * SIZE, (y / worldHeight) * SIZE];

  if (shopPos) {
    const [sx, sy] = toMini(shopPos.x, shopPos.y);
    drawDot(sx, sy, 3, "#ffd700");
  }

  remotePositions.forEach(({ x, y }) => {
    const [rx, ry] = toMini(x, y);
    drawDot(rx, ry, 2, "#aaaaaa");
  });

  if (localPos) {
    const [px, py] = toMini(localPos.x, localPos.y);
    drawDot(px, py, 3, "#ffffff");
  }
}

function drawDot(x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
