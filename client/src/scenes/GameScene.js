import {
  TILE_SIZE,
  PLAYER_SPEED,
  ARROW_SPEED,
  ARROW_LIFETIME_MS,
  MOVE_SEND_INTERVAL_MS,
  LEVEL_REQUIRED_FOR_SEA,
  WATER_SPEED_MULTIPLIER,
  SHOP_INTERACT_RADIUS,
  TILE_TYPES,
} from "../config.js";
import Network from "../network.js";
import { loadCharacter, saveCharacter } from "../storage.js";
import { xpToReachLevel, MAX_LEVEL } from "../leveling.js";
import { ITEMS } from "../items.js";
import { initUI, renderCharacter, showToast, updateShopProximity } from "../ui.js";
import { buildMinimapTerrain, renderMinimap } from "../minimap.js";

const TILE_COLORS = {
  [TILE_TYPES.GRASS]: 0x3a6b3a,
  [TILE_TYPES.DIRT]: 0x6b4f31,
  [TILE_TYPES.SAND]: 0xcbb26a,
  [TILE_TYPES.WATER]: 0x2a5d8f,
};

const ATTACK_COOLDOWN_MS = 300;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init() {
    this.network = null;
    this.character = loadCharacter();
    this.localPlayer = null;
    this.remotePlayers = new Map(); // id -> { sprite, label, target }
    this.arrows = new Map(); // arrowId -> { sprite, vx, vy, expireAt }
    this.worldItemSprites = new Map(); // itemId -> sprite
    this.pickupRequested = new Set(); // 중복 pickupItem 전송 방지
    this.monsters = new Map(); // id -> { sprite, hpBg, hpFill, target: {x,y}, maxHp }
    this.groundLayer = null;
    this.lastSend = { x: null, y: null, rotation: null, time: 0 };
    this.lastAttackTime = 0;
    this.menuOpen = false; // 인벤토리/상점/어드민 모달이 열려 있으면 이동/공격 입력을 멈춘다
    this.shopPosition = null;
    this.shopNear = false;
  }

  preload() {
    this.makeCharacterTexture("tex-player", 34);
    this.makeMonsterTexture("tex-monster-slime", 28, 0x55cc55);
    this.makeArrowTexture();
    this.makeSlashTexture();
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

  // 몬스터: 뿔 두 개 달린 슬라임 실루엣. 플레이어와 한눈에 구별되도록 각진 뿔을 붙였다.
  makeMonsterTexture(key, size, color) {
    const cx = size / 2;
    const cy = size / 2;
    const bodyR = size * 0.32;

    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(color, 1);
    g.fillTriangle(cx - bodyR * 0.9, cy - bodyR * 0.5, cx - bodyR * 0.3, cy - bodyR * 1.6, cx - bodyR * 0.1, cy - bodyR * 0.5);
    g.fillTriangle(cx + bodyR * 0.9, cy - bodyR * 0.5, cx + bodyR * 0.3, cy - bodyR * 1.6, cx + bodyR * 0.1, cy - bodyR * 0.5);
    g.fillCircle(cx, cy, bodyR);

    g.lineStyle(2, 0x000000, 0.4);
    g.strokeCircle(cx, cy, bodyR);

    g.fillStyle(0x000000, 0.8);
    g.fillCircle(cx - bodyR * 0.32, cy - bodyR * 0.1, 1.8);
    g.fillCircle(cx + bodyR * 0.32, cy - bodyR * 0.1, 1.8);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  makeArrowTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 3, 15, 2);
    g.fillTriangle(13, 0, 13, 8, 20, 4);
    g.generateTexture("tex-arrow", 20, 8);
    g.destroy();
  }

  // 근접 스윙 시 잠깐 나타났다 사라지는 얇은 칼자국 모양
  makeSlashTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(0, -3);
    g.lineTo(26, 0);
    g.lineTo(0, 3);
    g.closePath();
    g.fillPath();
    g.generateTexture("tex-slash", 28, 8);
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
    this.input.on("pointerdown", (pointer) => this.handleAttack(pointer));

    this.statusText = this.add
      .text(this.scale.width - 10, 10, "서버에 연결 중...", { font: "12px monospace", fill: "#8a8a92" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    initUI({
      onSlotClick: (index, def) => {
        if (!def) return;
        if (def.type === "consumable") this.network.useItem(index);
        else this.network.equipItem(index);
      },
      onBuy: (itemId) => this.network.buyItem(itemId),
      onSell: (index) => this.network.sellItem(index),
      onAdminSetGold: (value) => this.network.adminSetGold(value),
      onAdminSetLevel: (value) => this.network.adminSetLevel(value),
      onMenuOpenChange: (modalName) => {
        this.menuOpen = modalName !== null;
        if (this.menuOpen && this.localPlayer) this.localPlayer.body.setVelocity(0, 0);
      },
    });

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
        buildMinimapTerrain(data.world);
        this.spawnLocalPlayer(data.players[data.id]);

        Object.entries(data.players).forEach(([id, state]) => {
          if (id === data.id) return;
          this.spawnRemotePlayer(id, state);
        });

        Object.values(data.worldItems).forEach((item) => this.spawnWorldItem(item));
        Object.values(data.monsters).forEach((m) => this.spawnMonster(m));

        if (data.shop) {
          this.shopPosition = data.shop;
          this.spawnShopMarker(data.shop);
        }

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
      onMeleeAttack: ({ x, y, angle }) => this.playMeleeSwing(x, y, angle),
      onArrowCreated: (arrow) => this.spawnArrow(arrow),
      onArrowRemoved: ({ id }) => {
        const arrow = this.arrows.get(id);
        if (arrow) {
          arrow.sprite.destroy();
          this.arrows.delete(id);
        }
      },
      onMonsterSpawned: (m) => this.spawnMonster(m),
      onMonsterDamaged: ({ id, hp, maxHp }) => this.updateMonsterHp(id, hp, maxHp),
      onMonsterDied: ({ id }) => this.removeMonster(id),
      onMonstersUpdated: (list) => {
        list.forEach(({ id, x, y, hp, maxHp }) => {
          const entry = this.monsters.get(id);
          if (!entry) return;
          entry.target.x = x;
          entry.target.y = y;
          if (hp !== entry.lastHp) this.updateMonsterHp(id, hp, maxHp);
        });
      },
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
      onShopFailed: ({ reason }) => {
        if (reason === "not_enough_gold") showToast("골드가 부족합니다");
        else if (reason === "inventory_full") showToast("인벤토리가 가득 찼습니다");
        else if (reason === "too_far") showToast("상점에 가까이 가야 합니다");
      },
    });
  }

  applyCharacterState(state, leveledUp) {
    Object.assign(this.character, state);
    delete this.character.leveledUp;

    this.applyWaterCollision();

    const xpToNext = this.character.level >= MAX_LEVEL ? 1 : xpToReachLevel(this.character.level + 1);
    renderCharacter(this.character, xpToNext);

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

  spawnMonster(state) {
    const sprite = this.add.image(state.x, state.y, "tex-monster-slime");
    const hpBg = this.add.rectangle(state.x, state.y - 20, 24, 4, 0x000000, 0.5);
    const hpFill = this.add.rectangle(state.x - 12, state.y - 20, 24, 4, 0xff5577).setOrigin(0, 0.5);

    this.monsters.set(state.id, {
      sprite,
      hpBg,
      hpFill,
      maxHp: state.maxHp,
      lastHp: state.hp,
      target: { x: state.x, y: state.y },
    });
  }

  updateMonsterHp(id, hp, maxHp) {
    const entry = this.monsters.get(id);
    if (!entry) return;
    entry.lastHp = hp;
    entry.hpFill.width = Math.max(0, (hp / maxHp) * 24);
  }

  removeMonster(id) {
    const entry = this.monsters.get(id);
    if (!entry) return;

    this.tweens.add({
      targets: entry.sprite,
      alpha: 0,
      scale: 0.4,
      duration: 200,
      onComplete: () => {
        entry.sprite.destroy();
        entry.hpBg.destroy();
        entry.hpFill.destroy();
      },
    });
    this.monsters.delete(id);
  }

  spawnArrow(arrow) {
    const sprite = this.add.image(arrow.x, arrow.y, "tex-arrow");
    sprite.setTint(0xe8d9a0);
    sprite.setRotation(arrow.angle);

    this.arrows.set(arrow.id, {
      sprite,
      vx: Math.cos(arrow.angle) * ARROW_SPEED,
      vy: Math.sin(arrow.angle) * ARROW_SPEED,
      expireAt: this.time.now + ARROW_LIFETIME_MS,
    });
  }

  playMeleeSwing(x, y, angle) {
    const slash = this.add.image(x, y, "tex-slash");
    slash.setOrigin(0, 0.5);
    slash.setRotation(angle - 0.6);
    slash.setAlpha(0.9);
    slash.setTint(0xe4e4e7);

    this.tweens.add({
      targets: slash,
      rotation: angle + 0.6,
      alpha: 0,
      duration: 160,
      onComplete: () => slash.destroy(),
    });
  }

  spawnWorldItem(item) {
    const sprite = this.add.image(item.x, item.y, "tex-item");
    if (item.itemId) sprite.setTint(0xff66aa); // 장비/물약
    else if (item.gold > 0) sprite.setTint(0xffd700); // 골드
    else sprite.setTint(0x66ccff); // XP 조각
    this.worldItemSprites.set(item.id, sprite);
  }

  // 상점은 이 위치 반경(SHOP_INTERACT_RADIUS) 안에 있을 때만 이용 가능하다(서버가 최종 검증).
  spawnShopMarker(pos) {
    this.add.rectangle(pos.x, pos.y, TILE_SIZE * 1.4, TILE_SIZE * 1.4, 0xffd700, 0.85).setStrokeStyle(2, 0x0b0b0d);
    this.add
      .text(pos.x, pos.y - TILE_SIZE, "상점", { font: "12px monospace", fill: "#0b0b0d", backgroundColor: "#ffd700" })
      .setOrigin(0.5)
      .setPadding(3, 1, 3, 1);
  }

  handleAttack(pointer) {
    if (!this.localPlayer || !this.network || this.menuOpen) return;
    if (this.time.now - this.lastAttackTime < ATTACK_COOLDOWN_MS) return;
    this.lastAttackTime = this.time.now;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const angle = Phaser.Math.Angle.Between(this.localPlayer.x, this.localPlayer.y, worldPoint.x, worldPoint.y);

    const weaponId = this.character.equipped.weapon;
    const weaponDef = weaponId ? ITEMS[weaponId] : null;

    if (weaponDef?.attackType === "ranged") {
      this.network.sendRangedAttack(angle);
    } else {
      this.network.sendMeleeAttack(angle);
    }
  }

  update(time, delta) {
    if (this.localPlayer && !this.menuOpen) {
      this.handleMovement();
      this.faceMouse();
      this.sendMovementIfChanged(time);
      this.checkItemPickups();
    }

    this.interpolateRemotePlayers();
    this.interpolateMonsters();
    this.updateArrows(time, delta);
    this.updateMinimap();
    this.updateShopProximityCheck();
  }

  updateShopProximityCheck() {
    if (!this.localPlayer || !this.shopPosition) return;
    const dist = Phaser.Math.Distance.Between(this.localPlayer.x, this.localPlayer.y, this.shopPosition.x, this.shopPosition.y);
    const near = dist <= SHOP_INTERACT_RADIUS;
    if (near !== this.shopNear) {
      this.shopNear = near;
      updateShopProximity(near);
    }
  }

  updateMinimap() {
    if (!this.localPlayer) return;
    const remotePositions = [];
    this.remotePlayers.forEach(({ sprite }) => remotePositions.push({ x: sprite.x, y: sprite.y }));
    renderMinimap({
      localPos: { x: this.localPlayer.x, y: this.localPlayer.y },
      shopPos: this.shopPosition,
      remotePositions,
    });
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

  interpolateMonsters() {
    this.monsters.forEach(({ sprite, hpBg, hpFill, target }) => {
      sprite.x = Phaser.Math.Linear(sprite.x, target.x, 0.1);
      sprite.y = Phaser.Math.Linear(sprite.y, target.y, 0.1);
      hpBg.x = sprite.x;
      hpBg.y = sprite.y - 20;
      hpFill.x = sprite.x - 12;
      hpFill.y = sprite.y - 20;
    });
  }

  updateArrows(time, delta) {
    const dt = delta / 1000;
    this.arrows.forEach((arrow, id) => {
      arrow.sprite.x += arrow.vx * dt;
      arrow.sprite.y += arrow.vy * dt;

      if (time > arrow.expireAt) {
        arrow.sprite.destroy();
        this.arrows.delete(id);
      }
    });
  }
}
