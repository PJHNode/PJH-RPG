const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const {
  TILE_SIZE,
  ARROW_SPEED,
  ARROW_LIFETIME_MS,
  SHOP_INTERACT_RADIUS,
  OBSTACLE_RADIUS,
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

// nearCenter: true면 섬 중앙 부근(플레이어/상점 스폰용), false면 섬 전체에서 무작위(아이템/몬스터 스폰용)
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

// 중심에서 [minRadius, maxRadius] 타일 거리 사이의 육지를 무작위로 고른다 (지역별 몬스터 스폰용)
function randomLandSpawnInRing(minRadius, maxRadius) {
  const cx = MAP_COLS / 2;
  const cy = MAP_ROWS / 2;

  for (let attempt = 0; attempt < 100; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = minRadius + Math.random() * (maxRadius - minRadius);
    const gx = Math.floor(cx + Math.cos(angle) * dist);
    const gy = Math.floor(cy + Math.sin(angle) * dist);
    const tile = mapData[gy]?.[gx];
    if (tile !== undefined && isLandTile(tile)) {
      return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
    }
  }
  return randomLandSpawn({ nearCenter: false });
}

// 상점(마을 중앙 부근 고정 위치) - 클라이언트가 랜드마크/미니맵에 표시하고,
// 구매·판매는 이 위치에서 SHOP_INTERACT_RADIUS 안에 있을 때만 허용된다.
const SHOP_POSITION = randomLandSpawn({ nearCenter: true });

function isNearShop(player) {
  return Math.hypot(player.x - SHOP_POSITION.x, player.y - SHOP_POSITION.y) <= SHOP_INTERACT_RADIUS;
}

// ---- 월드 아이템(픽업) ----
let itemUid = 0;
const worldItems = {}; // id -> { id, itemId, xp, gold, x, y }

function createWorldItem(x, y, itemId, xp, gold = 0) {
  const id = `item-${itemUid++}`;
  worldItems[id] = {
    id,
    itemId: itemId ?? null,
    xp: xp ?? 0,
    gold: gold ?? 0,
    x: clamp(x, TILE_SIZE, WORLD_WIDTH - TILE_SIZE),
    y: clamp(y, TILE_SIZE, WORLD_HEIGHT - TILE_SIZE),
  };
  return worldItems[id];
}

function spawnWorldItem(itemId, xp, gold = 0) {
  const spawn = randomLandSpawn({ nearCenter: false });
  return createWorldItem(spawn.x, spawn.y, itemId, xp, gold);
}

function seedWorldItems() {
  const gearPool = ["wooden_sword", "iron_sword", "short_bow", "leather_armor", "health_potion"];
  for (let i = 0; i < 24; i++) {
    spawnWorldItem(gearPool[Math.floor(Math.random() * gearPool.length)], 0, 0);
  }
  for (let i = 0; i < 40; i++) spawnWorldItem(null, 15 + Math.floor(Math.random() * 15), 0);
  for (let i = 0; i < 30; i++) spawnWorldItem(null, 0, 5 + Math.floor(Math.random() * 15));
}
seedWorldItems();

// ---- 자연물 오브젝트 (나무/바위/수풀) ----
// 정적 장애물: 이동을 막고(엄폐), 화살도 막는다. 한 번 생성되면 사라지지 않으므로
// 월드 아이템과 달리 실시간 이벤트 없이 init 페이로드에만 담아 보낸다.
const OBSTACLE_TYPES = ["tree", "rock", "bush"];
const OBSTACLE_COUNT = 160;
const OBSTACLE_MIN_DIST_FROM_SHOP = TILE_SIZE * 4;

let obstacleUid = 0;
const obstacles = {}; // id -> { id, type, x, y }

function seedObstacles() {
  for (let i = 0; i < OBSTACLE_COUNT; i++) {
    const spawn = randomLandSpawn({ nearCenter: false });
    if (Math.hypot(spawn.x - SHOP_POSITION.x, spawn.y - SHOP_POSITION.y) < OBSTACLE_MIN_DIST_FROM_SHOP) continue;

    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const id = `obs-${obstacleUid++}`;
    obstacles[id] = { id, type, x: spawn.x, y: spawn.y };
  }
}
seedObstacles();

function blockedByObstacle(x, y) {
  return Object.values(obstacles).some((o) => Math.hypot(o.x - x, o.y - y) <= OBSTACLE_RADIUS);
}

// ---- 몬스터 ----
// 섬 중심에서의 거리로 스폰 지역을 나눠, 마을에서 멀어질수록 강한 몬스터가 나오게 한다.
const MONSTER_TYPES = {
  slime: { name: "슬라임", maxHp: 15, xp: 10, gold: 3, speed: 40, damage: 2, minRadius: 0, maxRadius: 25, count: 12 },
  wolf: { name: "늑대", maxHp: 30, xp: 25, gold: 8, speed: 70, damage: 4, minRadius: 25, maxRadius: 45, count: 10 },
  crab: { name: "게", maxHp: 45, xp: 40, gold: 15, speed: 30, damage: 6, minRadius: 45, maxRadius: ISLAND_RADIUS, count: 8 },
};
const MONSTER_WANDER_RADIUS = 150;
const MONSTER_RESPAWN_MS = 10000;

// 몬스터 어그로: 이 반경 안에 들어오면 배회 대신 그 플레이어를 쫓아간다.
// 추격 해제 반경을 더 넓게 잡아서(히스테리시스) 경계선에서 어그로가 깜빡이지 않게 함.
const AGGRO_RADIUS = 110;
const DEAGGRO_RADIUS = 220;

// 몬스터 접촉 데미지: 이 거리 안에 있으면 일정 주기로 플레이어를 때린다.
const CONTACT_RADIUS = 22;
const PLAYER_HIT_COOLDOWN_MS = 800;
const PLAYER_RESPAWN_INVULN_MS = 1500;

let monsterUid = 0;
const monsters = {}; // id -> { id, type, x, y, hp, maxHp, spawnX, spawnY, targetX, targetY, nextWanderAt, aggroId }

function spawnMonster(type) {
  const def = MONSTER_TYPES[type];
  const spawn = randomLandSpawnInRing(def.minRadius, def.maxRadius);
  const id = `mob-${monsterUid++}`;
  monsters[id] = {
    id,
    type,
    x: spawn.x,
    y: spawn.y,
    hp: def.maxHp,
    maxHp: def.maxHp,
    spawnX: spawn.x,
    spawnY: spawn.y,
    targetX: spawn.x,
    targetY: spawn.y,
    nextWanderAt: 0,
    aggroId: null,
  };
  return monsters[id];
}

function seedMonsters() {
  Object.entries(MONSTER_TYPES).forEach(([type, def]) => {
    for (let i = 0; i < def.count; i++) spawnMonster(type);
  });
}
seedMonsters();

// 처치/사망 시 부르는 단일 진입점: 근접 공격과 화살 명중 둘 다 여기로 들어온다.
// attackerId가 있으면 그 플레이어의 처치 퀘스트 진행도를 올린다.
function damageMonster(monsterId, amount, attackerId) {
  const m = monsters[monsterId];
  if (!m) return;

  m.hp -= amount;
  m.aggroId = attackerId ?? m.aggroId; // 맞으면 때린 사람을 바로 쫓아가기 시작

  if (m.hp > 0) {
    io.emit("monsterDamaged", { id: monsterId, hp: m.hp, maxHp: m.maxHp });
    return;
  }

  const def = MONSTER_TYPES[m.type];
  delete monsters[monsterId];
  io.emit("monsterDied", { id: monsterId });

  if (attackerId) creditQuestKill(attackerId, m.type);

  // 처치 보상은 기존 월드 아이템 픽업 시스템을 그대로 재사용해 몬스터 위치에 드랍
  const xpDrop = createWorldItem(m.x, m.y, null, def.xp, 0);
  io.emit("itemSpawned", xpDrop);
  if (Math.random() < 0.5) {
    const goldDrop = createWorldItem(m.x, m.y, null, 0, def.gold);
    io.emit("itemSpawned", goldDrop);
  }

  setTimeout(() => {
    const respawned = spawnMonster(m.type);
    io.emit("monsterSpawned", respawned);
  }, MONSTER_RESPAWN_MS);
}

// ---- 화살(원거리 공격) ----
// 클라이언트에는 발사 이벤트만 broadcast하고(로컬에서 같은 속도로 시각 재생),
// 실제 명중 판정은 서버가 tick마다 내부적으로 위치를 계산해 조용히 수행한다.
const ARROW_HIT_RADIUS = 16;
let arrowUid = 0;
const arrows = {}; // id -> { id, ownerId, x, y, vx, vy, damage, expireAt }

// ---- 근접 공격 ----
const MELEE_RANGE = 46;
const MELEE_ARC = Math.PI / 2; // 조준 방향 기준 좌우 45도씩

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// ---- 게임 tick: 몬스터 배회 + 화살 이동/명중 판정 ----
const TICK_MS = 100;

function findAggroTarget(m) {
  // 이미 쫓고 있는 플레이어가 있으면 DEAGGRO_RADIUS를 벗어나기 전까진 계속 쫓는다(히스테리시스).
  if (m.aggroId) {
    const current = players[m.aggroId];
    if (current && Math.hypot(current.x - m.x, current.y - m.y) <= DEAGGRO_RADIUS) return m.aggroId;
    m.aggroId = null;
  }

  let closestId = null;
  let closestDist = AGGRO_RADIUS;
  Object.entries(players).forEach(([id, p]) => {
    const dist = Math.hypot(p.x - m.x, p.y - m.y);
    if (dist <= closestDist) {
      closestDist = dist;
      closestId = id;
    }
  });
  return closestId;
}

function tickMonsters() {
  const now = Date.now();

  Object.values(monsters).forEach((m) => {
    const def = MONSTER_TYPES[m.type];
    m.aggroId = findAggroTarget(m);

    if (m.aggroId) {
      const target = players[m.aggroId];
      m.targetX = target.x;
      m.targetY = target.y;
    } else if (now >= m.nextWanderAt) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * MONSTER_WANDER_RADIUS;
      m.targetX = clamp(m.spawnX + Math.cos(angle) * dist, TILE_SIZE, WORLD_WIDTH - TILE_SIZE);
      m.targetY = clamp(m.spawnY + Math.sin(angle) * dist, TILE_SIZE, WORLD_HEIGHT - TILE_SIZE);
      m.nextWanderAt = now + 2000 + Math.random() * 3000;
    }

    const dx = m.targetX - m.x;
    const dy = m.targetY - m.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = (def.speed * TICK_MS) / 1000;
      const move = Math.min(step, dist);
      m.x += (dx / dist) * move;
      m.y += (dy / dist) * move;
    }

    if (m.aggroId) {
      const target = players[m.aggroId];
      if (target && Math.hypot(target.x - m.x, target.y - m.y) <= CONTACT_RADIUS) {
        damagePlayer(m.aggroId, def.damage);
      }
    }
  });

  io.emit(
    "monstersUpdated",
    Object.values(monsters).map((m) => ({ id: m.id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, aggro: !!m.aggroId }))
  );
}

function tickArrows() {
  const now = Date.now();
  const dt = TICK_MS / 1000;

  Object.values(arrows).forEach((a) => {
    if (now > a.expireAt) {
      delete arrows[a.id];
      return;
    }

    a.x += a.vx * dt;
    a.y += a.vy * dt;

    if (blockedByObstacle(a.x, a.y)) {
      delete arrows[a.id];
      io.emit("arrowRemoved", { id: a.id });
      return;
    }

    for (const m of Object.values(monsters)) {
      if (Math.hypot(m.x - a.x, m.y - a.y) > ARROW_HIT_RADIUS) continue;
      delete arrows[a.id];
      io.emit("arrowRemoved", { id: a.id });
      damageMonster(m.id, a.damage, a.ownerId);
      break;
    }
  });
}

setInterval(() => {
  tickMonsters();
  tickArrows();
}, TICK_MS);

// ---- 플레이어 ----
const players = {}; // socket.id -> state
const socketsById = {}; // socket.id -> socket 인스턴스 (tick 루프 등 io.on 콜백 밖에서 emit할 때 필요)

// ---- 퀘스트: 특정 몬스터 N마리 처치 -> XP/골드 보상, 완료 시 자동으로 다음 퀘스트 배정 ----
// NPC와의 대화 없이 접속하는 순간 하나씩 자동 배정되는 단순한 형태(반복 가능한 처치 퀘스트).
const QUEST_TARGET_MIN = 4;
const QUEST_TARGET_MAX = 8;

function createQuest() {
  const types = Object.keys(MONSTER_TYPES);
  const monsterType = types[Math.floor(Math.random() * types.length)];
  const target = QUEST_TARGET_MIN + Math.floor(Math.random() * (QUEST_TARGET_MAX - QUEST_TARGET_MIN + 1));
  return { monsterType, target, progress: 0 };
}

function creditQuestKill(socketId, monsterType) {
  const player = players[socketId];
  const socket = socketsById[socketId];
  if (!player || !socket || !player.quest) return;
  if (player.quest.monsterType !== monsterType) return;

  player.quest.progress += 1;

  if (player.quest.progress >= player.quest.target) {
    const def = MONSTER_TYPES[monsterType];
    const goldReward = player.quest.target * 5;
    const xpReward = player.quest.target * def.xp;

    player.gold += goldReward;
    const leveledUp = applyXp(player, xpReward);
    if (leveledUp) io.emit("playerLevelChanged", { id: socketId, level: player.level });

    socket.emit("questCompleted", { monsterType, goldReward, xpReward });
    player.quest = createQuest();
  }

  sendCharacterUpdate(socket, player);
}

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
    quest: createQuest(),
    lastHitAt: 0,
    invulnerableUntil: 0,
  };
}

// 몬스터 접촉 데미지의 단일 진입점. 쿨다운/무적시간을 체크하고, 사망하면 마을 근처에서 부활시킨다.
function damagePlayer(socketId, amount) {
  const player = players[socketId];
  const socket = socketsById[socketId];
  if (!player || !socket) return;

  const now = Date.now();
  if (now < player.invulnerableUntil) return;
  if (now - player.lastHitAt < PLAYER_HIT_COOLDOWN_MS) return;
  player.lastHitAt = now;

  player.hp = clamp(player.hp - amount, 0, player.maxHp);
  io.emit("playerHit", { id: socketId, x: player.x, y: player.y, amount, hp: player.hp, maxHp: player.maxHp });

  if (player.hp <= 0) {
    respawnPlayer(socketId);
    return;
  }

  sendCharacterUpdate(socket, player);
}

function respawnPlayer(socketId) {
  const player = players[socketId];
  const socket = socketsById[socketId];
  if (!player || !socket) return;

  const spawn = randomLandSpawn({ nearCenter: true });
  player.x = spawn.x;
  player.y = spawn.y;
  player.hp = player.maxHp;
  player.gold = Math.floor(player.gold * 0.9); // 죽으면 골드 10% 페널티
  player.invulnerableUntil = Date.now() + PLAYER_RESPAWN_INVULN_MS;

  io.emit("playerDied", { id: socketId });
  socket.emit("respawn", { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp, gold: player.gold });
  io.emit("playerMoved", { id: socketId, x: player.x, y: player.y, rotation: player.rotation });
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
    quest: player.quest,
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
  socketsById[socket.id] = socket;

  console.log(`[connect] ${socket.id} (${Object.keys(players).length} online)`);

  socket.emit("init", {
    id: socket.id,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, tileSize: TILE_SIZE, mapData },
    players,
    worldItems,
    monsters,
    obstacles,
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

  socket.on("meleeAttack", (data) => {
    const player = players[socket.id];
    if (!player) return;
    if (typeof data?.angle !== "number") return;

    const weaponDef = player.equipped.weapon ? ITEMS[player.equipped.weapon] : null;
    const damage = weaponDef?.stats?.damage ?? 1; // 맨손도 최소 데미지는 들어감

    io.emit("meleeAttack", { id: socket.id, x: player.x, y: player.y, angle: data.angle });

    Object.values(monsters).forEach((m) => {
      const dx = m.x - player.x;
      const dy = m.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MELEE_RANGE) return;

      const angleToMonster = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(angleToMonster, data.angle)) > MELEE_ARC / 2) return;

      damageMonster(m.id, damage, socket.id);
    });
  });

  socket.on("rangedAttack", (data) => {
    const player = players[socket.id];
    if (!player) return;
    if (typeof data?.angle !== "number") return;

    const weaponDef = player.equipped.weapon ? ITEMS[player.equipped.weapon] : null;
    if (!weaponDef || weaponDef.attackType !== "ranged") return;

    const id = `arrow-${arrowUid++}`;
    arrows[id] = {
      id,
      ownerId: socket.id,
      x: player.x,
      y: player.y,
      vx: Math.cos(data.angle) * ARROW_SPEED,
      vy: Math.sin(data.angle) * ARROW_SPEED,
      damage: weaponDef.stats?.damage ?? 1,
      expireAt: Date.now() + ARROW_LIFETIME_MS,
    };

    io.emit("arrowCreated", { id, x: player.x, y: player.y, angle: data.angle });
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

  socket.on("buyItem", (itemId) => {
    const player = players[socket.id];
    const def = ITEMS[itemId];
    if (!player || !def || typeof def.price !== "number") return;

    if (!isNearShop(player)) {
      socket.emit("shopFailed", { reason: "too_far" });
      return;
    }
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

    if (!isNearShop(player)) {
      socket.emit("shopFailed", { reason: "too_far" });
      return;
    }

    const slot = player.inventory[slotIndex];
    const def = slot && ITEMS[slot.itemId];
    if (!def || typeof def.price !== "number") return;

    const sellPrice = Math.max(1, Math.floor(def.price / 2));
    slot.qty -= 1;
    if (slot.qty <= 0) player.inventory[slotIndex] = null;
    player.gold += sellPrice;

    sendCharacterUpdate(socket, player);
  });

  // ---- 베타 테스트용 어드민(디버그) 이벤트 ----
  // 인증 없음 - 정식 서비스 전에는 반드시 제거하거나 잠가야 함(README 참고).
  socket.on("adminSetGold", (value) => {
    const player = players[socket.id];
    if (!player) return;
    player.gold = clampInt(value, 0, 999999);
    sendCharacterUpdate(socket, player);
  });

  socket.on("adminSetLevel", (value) => {
    const player = players[socket.id];
    if (!player) return;
    player.level = clampInt(value, 1, MAX_LEVEL);
    player.maxHp = maxHpForLevel(player.level);
    player.hp = player.maxHp;
    player.xp = 0;
    sendCharacterUpdate(socket, player);
    io.emit("playerLevelChanged", { id: socket.id, level: player.level });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    delete socketsById[socket.id];
    io.emit("playerLeft", { id: socket.id });
    console.log(`[disconnect] ${socket.id} (${Object.keys(players).length} online)`);
  });
});

server.listen(PORT, () => {
  console.log(`PJH-RPG server listening on http://localhost:${PORT}`);
});
