const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BULLET_SPEED,
  BULLET_LIFETIME_MS,
} = require("../shared/constants");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "..", "client")));

const PLAYER_COLORS = [0xff5555, 0x55ff99, 0x5599ff, 0xffdd55, 0xff77dd, 0x77ffe0];

// socket.id -> { x, y, rotation, color }
const players = {};

function randomSpawnPoint() {
  return {
    x: Math.round(WORLD_WIDTH / 2 + (Math.random() * 200 - 100)),
    y: Math.round(WORLD_HEIGHT / 2 + (Math.random() * 200 - 100)),
  };
}

io.on("connection", (socket) => {
  const spawn = randomSpawnPoint();
  players[socket.id] = {
    x: spawn.x,
    y: spawn.y,
    rotation: 0,
    color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
  };

  console.log(`[connect] ${socket.id} (${Object.keys(players).length} online)`);

  // 새로 접속한 클라이언트에게 현재 월드 상태 전달
  socket.emit("init", {
    id: socket.id,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    players,
  });

  // 기존 클라이언트들에게 새 플레이어 알림
  socket.broadcast.emit("playerJoined", { id: socket.id, ...players[socket.id] });

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
    const bullet = {
      id: bulletId,
      ownerId: socket.id,
      x: player.x,
      y: player.y,
      angle: data.angle,
      speed: BULLET_SPEED,
    };

    // 발사자를 포함한 전원에게 즉시 브로드캐스트 (탄환 이동은 각 클라이언트가 로컬 시뮬레이션)
    io.emit("bulletCreated", bullet);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
    console.log(`[disconnect] ${socket.id} (${Object.keys(players).length} online)`);
  });
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

server.listen(PORT, () => {
  console.log(`PJH-RPG server listening on http://localhost:${PORT}`);
});
