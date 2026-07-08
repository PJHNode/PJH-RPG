import {
  TILE_SIZE,
  PLAYER_SPEED,
  BULLET_SPEED,
  BULLET_LIFETIME_MS,
  MOVE_SEND_INTERVAL_MS,
  LEVEL_REQUIRED_FOR_SEA,
  WATER_SPEED_MULTIPLIER,
  TILE_TYPES,
} from "../config.js";
import Network from "../network.js";
import { loadCharacter, saveCharacter } from "../storage.js";
import { xpToReachLevel, MAX_LEVEL } from "../leveling.js";
import { renderHud, renderInventory, showToast } from "../ui.js";

const TILE_COLORS = {
  [TILE_TYPES.GRASS]: 0x3a6b3a,
  [TILE_TYPES.DIRT]: 0x6b4f31,
  [TILE_TYPES.SAND]: 0xcbb26a,
  [TILE_TYPES.WATER]: 0x2a5d8f,
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init() {
    this.network = null;
    this.character = loadCharacter();
    this.localPlayer = null;
    this.remotePlayers = new Map(); // id -> { sprite, label, target }
    this.bullets = new Map(); // bulletId -> { sprite, vx, vy, expireAt }
    this.worldItemSprites = new Map(); // itemId -> sprite
    this.pickupRequested = new Set(); // 중복 pickupItem 전송 방지
    this.groundLayer = null;
    this.lastSend = { x: null, y: null, rotation: null, time: 0 };
  }

  preload() {
    this.makeCharacterTexture("tex-player", 34);
    this.makeCircleTexture("tex-bullet", 5, 0xffe066);
    this.makeCircleTexture("tex-item", 8, 0xffffff);
    this.makeTilesetTexture();
  }

  makeCircleTexture(key, radius, color) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  // 원 하나짜리 placeholder 대신 탑다운 시점에서 사람처럼 보이도록 어깨(몸통)+머리로 구성.
  // 회전(rotation=0)일 때 머리가 오른쪽(+x)을 향하게 그려서, 캐릭터 회전이 곧 "바라보는 방향"이
  // 눈에 보이게 만든다(원은 회전해도 겉보기 변화가 없어서 조준 방향을 알 수 없었음).
  // 전체를 흰색으로 그려서 setTint(플레이어 색상)로 색을 입힌다.
  makeCharacterTexture(key, size) {
    const cx = size / 2;
    const cy = size / 2;
    const bodyRx = size * 0.34;
    const bodyRy = size * 0.29;
    const headRadius = size * 0.19;
    const headOffset = bodyRx * 0.62;
    const headCx = cx + headOffset;

    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx, cy, bodyRx * 2, bodyRy * 2);
    g.fillCircle(headCx, cy, headRadius);

    g.lineStyle(2, 0x000000, 0.35);
    g.strokeEllipse(cx, cy, bodyRx * 2, bodyRy * 2);
    g.strokeCircle(headCx, cy, headRadius);

    // 얼굴 방향을 알려주는 눈(진한 색이라 틴트해도 거의 그대로 보임)
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(headCx + headRadius * 0.35, cy - headRadius * 0.4, 1.6);
    g.fillCircle(headCx + headRadius * 0.35, cy + headRadius * 0.4, 1.6);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  makeTilesetTexture() {
    const types = Object.values(TILE_TYPES);
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    types.forEach((type) => {
      g.fillStyle(TILE_COLORS[type], 1);
      g.fillRect(type * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
      g.lineStyle(1, 0x000000, 0.15);
      g.strokeRect(type * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    });

    g.generateTexture("tileset-tex", types.length * TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  create() {
    this.moveKeys = this.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.input.on("pointerdown", (pointer) => this.handleShoot(pointer));

    this.statusText = this.add
      .text(this.scale.width - 10, 10, "서버에 연결 중...", { font: "12px monospace", fill: "#8a8a92" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.connect();
  }

  buildTilemap(mapPayload) {
    const { width, height, tileSize, mapData } = mapPayload;

    this.tilemap = this.make.tilemap({ data: mapData, tileWidth: tileSize, tileHeight: tileSize });
    const tileset = this.tilemap.addTilesetImage("tileset-tex", "tileset-tex", tileSize, tileSize, 0, 0);
    this.groundLayer = this.tilemap.createLayer(0, tileset, 0, 0);
    this.applyWaterCollision();

    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
  }

  applyWaterCollision() {
    if (!this.groundLayer) return;
    const blocked = this.character.level < LEVEL_REQUIRED_FOR_SEA;
    this.groundLayer.setCollision(TILE_TYPES.WATER, blocked);
  }

  connect() {
    this.network = new Network({
      onInit: (data) => {
        this.buildTilemap(data.world);
        this.spawnLocalPlayer(data.players[data.id]);

        Object.entries(data.players).forEach(([id, state]) => {
          if (id === data.id) return;
          this.spawnRemotePlayer(id, state);
        });

        Object.values(data.worldItems).forEach((item) => this.spawnWorldItem(item));

        this.network.loadCharacter(this.character);
        this.refreshStatus();
      },
      onCharacterReady: (state) => this.applyCharacterState(state, false),
      onCharacterUpdated: (state) => this.applyCharacterState(state, state.leveledUp),
      onPlayerJoined: ({ id, ...state }) => {
        this.spawnRemotePlayer(id, state);
        this.refreshStatus();
      },
      onPlayerMoved: ({ id, x, y, rotation }) => {
        const entry = this.remotePlayers.get(id);
        if (!entry) return;
        entry.target.x = x;
        entry.target.y = y;
        entry.target.rotation = rotation;
      },
      onPlayerLevelChanged: ({ id, level }) => {
        const entry = this.remotePlayers.get(id);
        if (entry) entry.label.setText(`Lv.${level}`);
      },
      onPlayerLeft: ({ id }) => {
        const entry = this.remotePlayers.get(id);
        if (!entry) return;
        entry.sprite.destroy();
        entry.label.destroy();
        this.remotePlayers.delete(id);
        this.refreshStatus();
      },
      onBulletCreated: (bullet) => this.spawnBullet(bullet),
      onItemSpawned: (item) => this.spawnWorldItem(item),
      onItemRemoved: ({ id }) => {
        this.pickupRequested.delete(id);
        const sprite = this.worldItemSprites.get(id);
        if (sprite) {
          sprite.destroy();
          this.worldItemSprites.delete(id);
        }
      },
      onPickupFailed: ({ reason }) => {
        this.pickupRequested.clear();
        if (reason === "inventory_full") showToast("인벤토리가 가득 찼습니다");
      },
    });
  }

  applyCharacterState(state, leveledUp) {
    Object.assign(this.character, state);
    delete this.character.leveledUp;

    this.applyWaterCollision();

    const xpToNext = this.character.level >= MAX_LEVEL ? 1 : xpToReachLevel(this.character.level + 1);
    renderHud(this.character, xpToNext);
    renderInventory(this.character, {
      onSlotClick: (index, def) => {
        if (!def) return;
        if (def.type === "consumable") this.network.useItem(index);
        else this.network.equipItem(index);
      },
    });

    if (leveledUp) showToast(`레벨 업! Lv.${this.character.level}`);

    saveCharacter(this.character);
  }

  refreshStatus() {
    this.statusText.setText(`플레이어 수: ${this.remotePlayers.size + 1}`);
  }

  spawnLocalPlayer(state) {
    const sprite = this.physics.add.image(state.x, state.y, "tex-player");
    sprite.setTint(state.color ?? 0xffffff);
    sprite.setCollideWorldBounds(true);
    this.localPlayer = sprite;

    this.cameras.main.startFollow(sprite, true, 0.15, 0.15);

    if (this.groundLayer) {
      this.physics.add.collider(sprite, this.groundLayer);
    }
  }

  spawnRemotePlayer(id, state) {
    const sprite = this.add.image(state.x, state.y, "tex-player");
    sprite.setTint(state.color ?? 0xaaaaaa);
    const label = this.add
      .text(state.x, state.y - 24, `Lv.${state.level ?? 1}`, { font: "10px monospace", fill: "#8a8a92" })
      .setOrigin(0.5);

    this.remotePlayers.set(id, {
      sprite,
      label,
      target: { x: state.x, y: state.y, rotation: state.rotation ?? 0 },
    });
  }

  spawnBullet(bullet) {
    const sprite = this.add.image(bullet.x, bullet.y, "tex-bullet");
    this.bullets.set(bullet.id, {
      sprite,
      vx: Math.cos(bullet.angle) * BULLET_SPEED,
      vy: Math.sin(bullet.angle) * BULLET_SPEED,
      expireAt: this.time.now + BULLET_LIFETIME_MS,
    });
  }

  spawnWorldItem(item) {
    const sprite = this.add.image(item.x, item.y, "tex-item");
    sprite.setTint(item.itemId ? 0xffe066 : 0x66ccff);
    this.worldItemSprites.set(item.id, sprite);
  }

  handleShoot(pointer) {
    if (!this.localPlayer || !this.network) return;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const angle = Phaser.Math.Angle.Between(this.localPlayer.x, this.localPlayer.y, worldPoint.x, worldPoint.y);
    this.network.sendShoot(this.localPlayer.x, this.localPlayer.y, angle);
  }

  update(time, delta) {
    if (this.localPlayer) {
      this.handleMovement();
      this.faceMouse();
      this.sendMovementIfChanged(time);
      this.checkItemPickups();
    }

    this.interpolateRemotePlayers();
    this.updateBullets(time, delta);
  }

  currentTileType() {
    if (!this.groundLayer || !this.localPlayer) return null;
    const tile = this.groundLayer.getTileAtWorldXY(this.localPlayer.x, this.localPlayer.y, true);
    return tile ? tile.index : null;
  }

  handleMovement() {
    const body = this.localPlayer.body;
    let vx = 0;
    let vy = 0;

    if (this.moveKeys.left.isDown || this.cursorKeys.left.isDown) vx -= 1;
    if (this.moveKeys.right.isDown || this.cursorKeys.right.isDown) vx += 1;
    if (this.moveKeys.up.isDown || this.cursorKeys.up.isDown) vy -= 1;
    if (this.moveKeys.down.isDown || this.cursorKeys.down.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      let speed = PLAYER_SPEED;
      if (this.currentTileType() === TILE_TYPES.WATER) speed *= WATER_SPEED_MULTIPLIER;
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
    }

    body.setVelocity(vx, vy);
  }

  faceMouse() {
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.localPlayer.rotation = Phaser.Math.Angle.Between(
      this.localPlayer.x,
      this.localPlayer.y,
      worldPoint.x,
      worldPoint.y
    );
  }

  sendMovementIfChanged(time) {
    if (time - this.lastSend.time < MOVE_SEND_INTERVAL_MS) return;

    const { x, y, rotation } = this.localPlayer;
    if (x === this.lastSend.x && y === this.lastSend.y && rotation === this.lastSend.rotation) return;

    this.network.sendMovement(x, y, rotation);
    this.lastSend = { x, y, rotation, time };
  }

  checkItemPickups() {
    this.worldItemSprites.forEach((sprite, id) => {
      if (this.pickupRequested.has(id)) return;
      const dist = Phaser.Math.Distance.Between(this.localPlayer.x, this.localPlayer.y, sprite.x, sprite.y);
      if (dist < TILE_SIZE) {
        this.pickupRequested.add(id);
        this.network.pickupItem(id);
      }
    });
  }

  interpolateRemotePlayers() {
    this.remotePlayers.forEach(({ sprite, label, target }) => {
      sprite.x = Phaser.Math.Linear(sprite.x, target.x, 0.25);
      sprite.y = Phaser.Math.Linear(sprite.y, target.y, 0.25);
      sprite.rotation = target.rotation;
      label.x = sprite.x;
      label.y = sprite.y - 24;
    });
  }

  updateBullets(time, delta) {
    const dt = delta / 1000;
    this.bullets.forEach((bullet, id) => {
      bullet.sprite.x += bullet.vx * dt;
      bullet.sprite.y += bullet.vy * dt;

      if (time > bullet.expireAt) {
        bullet.sprite.destroy();
        this.bullets.delete(id);
      }
    });
  }
}
