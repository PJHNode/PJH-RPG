const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const {
  TILE_SIZE,
  BULLET_SPEED,
  TILE_TYPES,
} = require("../shared/constants");
const { generateIslandMap, isLandTile } = require("../shared/islandMap");
const { ITEMS, INVENTORY_SIZE } = require("../shared/items");
const { MAX_LEVEL, BASE_MAX_HP, maxHpForLevel, applyXp } = require("../shared/leveling");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "..", "client")));

const PLAYER_COLORS = [0xff5555, 0x55ff99, 0x5599ff, 0xffdd55, 0xff77dd, 0x77ffe0];

// ---- 시작의 섬 지형 ----
// 이전(50x50, 반지름20)은 카메라가 움직일 여지가 거의 없을 만큼 작았어서
// 면적 기준 약 10배로 키움. 절차적 생성이라 숫자만 키우면 됨.
const MAP_COLS = 160;
const MAP_ROWS = 160;
const ISLAND_RADIUS = 65;
const COAST_BAND = 5;

const mapData = generateIslandMap({
  cols: MAP_COLS,
  rows: MAP_ROWS,
  islandRadius: ISLAND_RADIUS,
  coastBand: COAST_BAND,
});

const WORLD_WIDTH = MAP_COLS * TILE_SIZE;
const WORLD_HEIGHT = MAP_ROWS * TILE_SIZE;

// nearCenter: true면 섬 중앙 부근(플레이어 스폰용), false면 섬 전체에서 무작위(아이템 스폰용)
function randomLandSpawn({ nearCenter = false } = {}) {
  const cx = Math.floor(MAP_COLS / 2);
  const cy = Math.floor(MAP_ROWS / 2);

  for (let attempt = 0; attempt < 80; attempt++) {
    let gx;
    let gy;
    if (nearCenter) {
      gx = cx + Math.floor(Math.random() * 20 - 10);
      gy = cy + Math.floor(Math.random() * 20 - 10);
    } else {
      gx = Math.floor(Math.random() * MAP_COLS);
      gy = Math.floor(Math.random() * MAP_ROWS);
    }
    const tile = mapData[gy]?.[gx];
    if (tile !== undefined && isLandTile(tile)) {
      return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
    }
  }
  return { x: cx * TILE_SIZE, y: cy * TILE_SIZE };
}

// 상점(마을 중앙 부근 고정 위치) - 클라이언트는 여기에 랜드마크를 그리고 미니맵에 표시
const SHOP_POSITION = randomLandSpawn({ nearCenter: true });

// ---- 월드 아이템(픽업) ----
let itemUid = 0;
const worldItems = {}; // id -> { id, itemId, xp, gold, x, y }

function spawnWorldItem(itemId, xp, gold = 0) {
  const spawn = randomLandSpawn({ nearCenter: false });
  const id = `item-${itemUid++}`;
  worldItems[id] = {
    id,
    itemId: itemId ?? null,
    xp: xp ?? 0,
    gold: gold ?? 0,
    x: clamp(spawn.x, TILE_SIZE, WORLD_WIDTH - TILE_SIZE),
    y: clamp(spawn.y, TILE_SIZE, WORLD_HEIGHT - TILE_SIZE),
  };
  return worldItems[id];
}

function seedWorldItems() {
  const gearPool = ["wooden_sword", "iron_sword", "leather_armor", "health_potion"];
  for (let i = 0; i < 24; i++) {
    spawnWorldItem(gearPool[Math.floor(Math.random() * gearPool.length)], 0, 0);
  }
  for (let i = 0; i < 40; i++) spawnWorldItem(null, 15 + Math.floor(Math.random() * 15), 0);
  for (let i = 0; i < 30; i++) spawnWorldItem(null, 0, 5 + Math.floor(Math.random() * 15));
}
seedWorldItems();

// ---- 플레이어 ----
const players = {}; // socket.id -> state

function createDefaultCharacter() {
  const spawn = randomLandSpawn({ nearCenter: true });
  return {
    x: spawn.x,
    y: spawn.y,
    rotation: 0,
    color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
    level: 1,
    xp: 0,
    hp: BASE_MAX_HP,
    maxHp: BASE_MAX_HP,
    gold: 0,
    inventory: new Array(INVENTORY_SIZE).fill(null),
    equipped: { weapon: null, armor: null },
  };
}

function sanitizeInventory(raw) {
  const inventory = new Array(INVENTORY_SIZE).fill(null);
  if (!Array.isArray(raw)) return inventory;

  raw.slice(0, INVENTORY_SIZE).forEach((slot, i) => {
    const def = slot && ITEMS[slot.itemId];
    if (def && Number(slot.qty) > 0) {
      inventory[i] = { itemId: slot.itemId, qty: Math.min(Number(slot.qty), def.maxStack ?? 999) };
    }
  });

  return inventory;
}

function sanitizeEquipped(raw) {
  const equipped = { weapon: null, armor: null };
  if (raw?.weapon && ITEMS[raw.weapon]?.type === "weapon") equipped.weapon = raw.weapon;
  if (raw?.armor && ITEMS[raw.armor]?.type === "armor") equipped.armor = raw.armor;
  return equipped;
}

function addToInventory(inventory, itemId, qty) {
  const def = ITEMS[itemId];
  if (!def) return false;

  if (def.stackable) {
    const existingIndex = inventory.findIndex(
      (slot) => slot && slot.itemId === itemId && slot.qty < (def.maxStack ?? Infinity)
    );
    if (existingIndex !== -1) {
      inventory[existingIndex].qty += qty;
      return true;
    }
  }

  const emptyIndex = inventory.findIndex((slot) => slot === null);
  if (emptyIndex === -1) return false;

  inventory[emptyIndex] = { itemId, qty };
  return true;
}

function sendCharacterUpdate(socket, player, leveledUp = false) {
  socket.emit("characterUpdated", {
    hp: player.hp,
    maxHp: player.maxHp,
    xp: player.xp,
    level: player.level,
    gold: player.gold,
    inventory: player.inventory,
    equipped: player.equipped,
    leveledUp,
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampInt(value, min, max) {
  return clamp(Math.round(Number(value) || min), min, max);
}

io.on("connection", (socket) => {
  players[socket.id] = createDefaultCharacter();

  console.log(`[connect] ${socket.id} (${Object.keys(players).length} online)`);

  socket.emit("init", {
    id: socket.id,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, tileSize: TILE_SIZE, mapData },
    players,
    worldItems,
    shop: SHOP_POSITION,
    maxLevel: MAX_LEVEL,
  });

  socket.broadcast.emit("playerJoined", { id: socket.id, ...players[socket.id] });

  // 클라이언트가 localStorage에서 불러온 캐릭터 상태를 서버 상태에 반영
  socket.on("loadCharacter", (saved) => {
    const player = players[socket.id];
    if (!player) return;

    player.level = clampInt(saved?.level, 1, MAX_LEVEL);
    player.xp = Math.max(0, Number(saved?.xp) || 0);
    player.maxHp = maxHpForLevel(player.level);
    player.hp = clamp(Number(saved?.hp) || player.maxHp, 1, player.maxHp);
    player.gold = Math.max(0, Number(saved?.gold) || 0);
    player.inventory = sanitizeInventory(saved?.inventory);
    player.equipped = sanitizeEquipped(saved?.equipped);

    socket.emit("characterReady", player);
    socket.broadcast.emit("playerLevelChanged", { id: socket.id, level: player.level });
  });

  socket.on("playerMovement", (data) => {
    const player = players[socket.id];
    if (!player) return;
    if (typeof data?.x !== "number" || typeof data?.y !== "number") return;

    player.x = clamp(data.x, 0, WORLD_WIDTH);
    player.y = clamp(data.y, 0, WORLD_HEIGHT);
    player.rotation = typeof data.rotation === "number" ? data.rotation : player.rotation;

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y,
      rotation: player.rotation,
    });
  });

  socket.on("shoot", (data) => {
    const player = players[socket.id];
    if (!player) return;
    if (typeof data?.angle !== "number") return;

    const bulletId = `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    io.emit("bulletCreated", {
      id: bulletId,
      ownerId: socket.id,
      x: player.x,
      y: player.y,
      angle: data.angle,
      speed: BULLET_SPEED,
    });
  });

  socket.on("pickupItem", (data) => {
    const player = players[socket.id];
    const worldItem = worldItems[data?.id];
    if (!player || !worldItem) return;

    const dist = Math.hypot(player.x - worldItem.x, player.y - worldItem.y);
    if (dist > TILE_SIZE * 2.5) return; // 너무 멀면 무시(기초 검증)

    delete worldItems[worldItem.id];
    io.emit("itemRemoved", { id: worldItem.id });

    if (worldItem.itemId) {
      const added = addToInventory(player.inventory, worldItem.itemId, 1);
      if (!added) {
        worldItems[worldItem.id] = worldItem;
        io.emit("itemSpawned", worldItem);
        socket.emit("pickupFailed", { reason: "inventory_full" });
        return;
      }
    }

    let leveledUp = false;
    if (worldItem.xp > 0) {
      leveledUp = applyXp(player, worldItem.xp);
      if (leveledUp) io.emit("playerLevelChanged", { id: socket.id, level: player.level });
    }

    if (worldItem.gold > 0) {
      player.gold += worldItem.gold;
    }

    sendCharacterUpdate(socket, player, leveledUp);

    // 주운 자리를 계속 비워두지 않도록 잠시 후 같은 종류로 리스폰
    setTimeout(() => {
      const respawned = spawnWorldItem(worldItem.itemId, worldItem.xp, worldItem.gold);
      io.emit("itemSpawned", respawned);
    }, 8000);
  });

  socket.on("buyItem", (itemId) => {
    const player = players[socket.id];
    const def = ITEMS[itemId];
    if (!player || !def || typeof def.price !== "number") return;

    if (player.gold < def.price) {
      socket.emit("shopFailed", { reason: "not_enough_gold" });
      return;
    }

    const added = addToInventory(player.inventory, itemId, 1);
    if (!added) {
      socket.emit("shopFailed", { reason: "inventory_full" });
      return;
    }

    player.gold -= def.price;
    sendCharacterUpdate(socket, player);
  });

  socket.on("sellItem", (slotIndex) => {
    const player = players[socket.id];
    if (!player) return;

    const slot = player.inventory[slotIndex];
    const def = slot && ITEMS[slot.itemId];
    if (!def || typeof def.price !== "number") return;

    const sellPrice = Math.max(1, Math.floor(def.price / 2));
    slot.qty -= 1;
    if (slot.qty <= 0) player.inventory[slotIndex] = null;
    player.gold += sellPrice;

    sendCharacterUpdate(socket, player);
  });

  socket.on("equipItem", (slotIndex) => {
    const player = players[socket.id];
    if (!player) return;

    const slot = player.inventory[slotIndex];
    const def = slot && ITEMS[slot.itemId];
    if (!def || (def.type !== "weapon" && def.type !== "armor")) return;

    const key = def.type; // 'weapon' | 'armor'
    const previous = player.equipped[key];

    player.inventory[slotIndex] = previous ? { itemId: previous, qty: 1 } : null;
    player.equipped[key] = slot.itemId;

    sendCharacterUpdate(socket, player);
  });

  socket.on("useItem", (slotIndex) => {
    const player = players[socket.id];
    if (!player) return;

    const slot = player.inventory[slotIndex];
    const def = slot && ITEMS[slot.itemId];
    if (!def || def.type !== "consumable") return;

    if (def.effect?.heal) {
      player.hp = clamp(player.hp + def.effect.heal, 0, player.maxHp);
    }

    slot.qty -= 1;
    if (slot.qty <= 0) player.inventory[slotIndex] = null;

    sendCharacterUpdate(socket, player);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
    console.log(`[disconnect] ${socket.id} (${Object.keys(players).length} online)`);
  });
});

server.listen(PORT, () => {
  console.log(`PJH-RPG server listening on http://localhost:${PORT}`);
});
