(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const TILE = 32;
  const COLS = canvas.width / TILE;
  const ROWS = canvas.height / TILE;

  // 0 = floor, 1 = wall, 2 = npc, 3 = chest
  const MAP = [
    "11111111111111111111",
    "10000000000000000001",
    "10111011111011111001",
    "10100000000010001001",
    "10100111110010101001",
    "10100100000010101001",
    "10100102000010101001",
    "10100111110010101001",
    "10100000000010001001",
    "10111111111011101001",
    "10000000000000001001",
    "10111111111111101001",
    "10000000000000000001",
    "10000000030000000001",
    "11111111111111111111",
  ].map((row) => row.split("").map(Number));

  const TILE_COLORS = {
    0: "#1c1c20",
    1: "#3a3a42",
  };

  const player = {
    gridX: 2,
    gridY: 1,
    x: 2 * TILE,
    y: 1 * TILE,
    targetX: 2 * TILE,
    targetY: 1 * TILE,
    moving: false,
    dir: "down",
    speed: 3, // pixels per frame while moving
    level: 1,
    hp: 20,
    maxHp: 20,
    gold: 0,
  };

  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  const hudLevel = document.getElementById("hud-level");
  const hudHp = document.getElementById("hud-hp");
  const hudGold = document.getElementById("hud-gold");
  const messageBox = document.getElementById("message-box");
  const messageText = document.getElementById("message-text");
  const messageClose = document.getElementById("message-close");

  function showMessage(text) {
    messageText.textContent = text;
    messageBox.classList.remove("hidden");
  }
  messageClose.addEventListener("click", () => {
    messageBox.classList.add("hidden");
  });

  function tileAt(gx, gy) {
    if (gy < 0 || gy >= ROWS || gx < 0 || gx >= COLS) return 1;
    return MAP[gy][gx];
  }

  function tryInteract(gx, gy) {
    const tile = tileAt(gx, gy);
    if (tile === 2) {
      showMessage("낯선 여행자가 말한다: \"이 던전 너머에 오래된 보물이 잠들어 있다네.\"");
      return true;
    }
    if (tile === 3) {
      MAP[gy][gx] = 0;
      player.gold += 10;
      showMessage("보물 상자를 열었다! 골드 +10");
      return true;
    }
    return false;
  }

  function updateInput() {
    if (player.moving || !messageBox.classList.contains("hidden")) return;

    let dx = 0, dy = 0, dir = player.dir;
    if (keys["arrowup"] || keys["w"]) { dy = -1; dir = "up"; }
    else if (keys["arrowdown"] || keys["s"]) { dy = 1; dir = "down"; }
    else if (keys["arrowleft"] || keys["a"]) { dx = -1; dir = "left"; }
    else if (keys["arrowright"] || keys["d"]) { dx = 1; dir = "right"; }
    else return;

    player.dir = dir;
    const nx = player.gridX + dx;
    const ny = player.gridY + dy;
    const tile = tileAt(nx, ny);

    if (tile === 1) return; // wall, blocked
    if (tile === 2) { tryInteract(nx, ny); return; } // npc blocks movement, just talk

    if (tile === 3) tryInteract(nx, ny);

    player.gridX = nx;
    player.gridY = ny;
    player.targetX = nx * TILE;
    player.targetY = ny * TILE;
    player.moving = true;
  }

  function updateMovement() {
    if (!player.moving) return;
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;

    if (Math.abs(dx) <= player.speed && Math.abs(dy) <= player.speed) {
      player.x = player.targetX;
      player.y = player.targetY;
      player.moving = false;
    } else {
      player.x += Math.sign(dx) * player.speed;
      player.y += Math.sign(dy) * player.speed;
    }
  }

  function drawMap() {
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const tile = MAP[gy][gx];
        ctx.fillStyle = tile === 1 ? TILE_COLORS[1] : TILE_COLORS[0];
        ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);

        if (tile === 2) {
          ctx.fillStyle = "#6b8cff";
          ctx.fillRect(gx * TILE + 6, gy * TILE + 4, TILE - 12, TILE - 8);
        } else if (tile === 3) {
          ctx.fillStyle = "#d4af37";
          ctx.fillRect(gx * TILE + 6, gy * TILE + 10, TILE - 12, TILE - 16);
        }
      }
    }
  }

  function drawPlayer() {
    ctx.fillStyle = "#e4e4e7";
    ctx.fillRect(player.x + 6, player.y + 4, TILE - 12, TILE - 8);

    // facing indicator
    ctx.fillStyle = "#0b0b0d";
    const cx = player.x + TILE / 2;
    const cy = player.y + TILE / 2;
    const r = 3;
    let ix = cx, iy = cy;
    if (player.dir === "up") iy -= 8;
    if (player.dir === "down") iy += 8;
    if (player.dir === "left") ix -= 8;
    if (player.dir === "right") ix += 8;
    ctx.fillRect(ix - r, iy - r, r * 2, r * 2);
  }

  function updateHud() {
    hudLevel.textContent = player.level;
    hudHp.textContent = `${player.hp} / ${player.maxHp}`;
    hudGold.textContent = player.gold;
  }

  function loop() {
    updateInput();
    updateMovement();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    drawPlayer();
    updateHud();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
