import {
  TILE_SIZE,
  PLAYER_SPEED,
  ARROW_SPEED,
  ARROW_LIFETIME_MS,
  MONSTER_PROJECTILE_LIFETIME_MS,
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
import {
  initUI,
  renderCharacter,
  showToast,
  updateShopProximity,
  updateQuestNpcProximity,
  toggleNpcDialogue,
} from "../ui.js";
import { buildMinimapTerrain, renderMinimap } from "../minimap.js";
import {
  unlockAudio,
  playSwordSwingSound,
  playArrowShotSound,
  playHitSound,
  playPickupSound,
  playLevelUpSound,
} from "../sound.js";

const TILE_COLORS = {
  [TILE_TYPES.GRASS]: 0x3a6b3a,
  [TILE_TYPES.DIRT]: 0x6b4f31,
  [TILE_TYPES.SAND]: 0xcbb26a,
  [TILE_TYPES.WATER]: 0x2a5d8f,
};

const MONSTER_VISUALS = {
  slime: { color: 0x55cc55, size: 28 },
  wolf: { color: 0x9a9aa2, size: 32 },
  crab: { color: 0xdd5533, size: 30 },
};

const MONSTER_NAMES = { slime: "슬라임", wolf: "늑대", crab: "게" };

const ATTACK_COOLDOWN_MS = 300;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 2;
const TOP_DEPTH = 999999; // 화살/슬래시 등 VFX - 항상 맨 위
const LABEL_DEPTH = 999998; // 이름표/HP바 - 지형·오브젝트보다 항상 위
const ITEM_DEPTH = 999997; // 월드 아이템 픽업

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init() {
    this.network = null;
    this.character = loadCharacter();
    this.localPlayer = null;
    this.localShadow = null;
    this.remotePlayers = new Map(); // id -> { sprite, shadow, label, target }
    this.arrows = new Map(); // arrowId -> { sprite, vx, vy, expireAt, trailTimer }
    this.monsterProjectiles = new Map(); // id -> { sprite, vx, vy, expireAt }
    this.worldItemSprites = new Map(); // itemId -> sprite
    this.pickupRequested = new Set(); // 중복 pickupItem 전송 방지
    this.monsters = new Map(); // id -> { sprite, shadow, hpBg, hpFill, target, maxHp, lastHp }
    this.obstacleGroup = null;
    this.groundLayer = null;
    this.lastSend = { x: null, y: null, rotation: null, time: 0 };
    this.lastAttackTime = 0;
    this.menuOpen = false; // 인벤토리/상점/어드민 모달이 열려 있으면 이동/공격 입력을 멈춘다
    this.shopPosition = null;
    this.shopNear = false;
    this.questNpcPosition = null;
    this.questNpcNear = false;
    this.questNpcSprite = null;
  }

  preload() {
    this.makeCharacterTexture("tex-player", 34);
    Object.entries(MONSTER_VISUALS).forEach(([type, v]) => {
      this.makeMonsterTexture(`tex-monster-${type}`, v.size, v.color);
    });
    this.makeArrowTexture();
    this.makeMonsterProjectileTexture();
    this.makeSlashTexture();
    this.makeShadowTexture();
    this.makeCircleTexture("tex-item", 8, 0xffffff);
    this.makeObstacleTextures();
    this.makeShopTexture();
    this.makeQuestNpcTexture();
    this.makeQuestMarkTexture();
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

  // 몬스터: 뿔 두 개 달린 슬라임류 실루엣. 종류별로 색만 다르게 재사용한다.
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

  // 게가 던지는 원거리 공격 투사체(거품/집게 덩어리) - 화살과 겉모습이 확실히 다르게
  makeMonsterProjectileTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x3aa06b, 1);
    g.fillCircle(7, 7, 7);
    g.fillStyle(0x7fe0a8, 0.7);
    g.fillCircle(5, 5, 3);
    g.lineStyle(1, 0x0b0b0d, 0.3);
    g.strokeCircle(7, 7, 7);
    g.generateTexture("tex-monster-projectile", 14, 14);
    g.destroy();
  }

  // 근접 스윙 이펙트: 예전엔 그냥 얇은 삼각형 "칼자국"이라 칼처럼 안 보인다는 지적을 받아서,
  // 손잡이+날밑(가드)+칼날로 구성된 실제 검 모양으로 다시 그렸다. 원점(0, 0.5)이 손잡이 쪽이라
  // 플레이어 위치에 두고 조준 방향 기준으로 회전시키면 검을 쥐고 휘두르는 것처럼 보인다.
  // 사거리(MELEE_RANGE=46px)와 비슷한 길이로 맞춰서 "칼이 너무 작아 보인다"도 함께 해결.
  makeSlashTexture() {
    const w = 52;
    const h = 14;
    const midY = h / 2;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // 손잡이(자루)
    g.fillStyle(0x5a3d24, 1);
    g.fillRect(0, midY - 2, 9, 4);

    // 날밑(가드)
    g.fillStyle(0x2a2a30, 1);
    g.fillRect(8, midY - 5, 3, 10);

    // 칼날 - 가드에서 뻗어나가 끝이 뾰족해지는 형태
    g.fillStyle(0xd8d8de, 1);
    g.beginPath();
    g.moveTo(11, midY - 3);
    g.lineTo(w - 4, midY - 1.2);
    g.lineTo(w, midY);
    g.lineTo(w - 4, midY + 1.2);
    g.lineTo(11, midY + 3);
    g.closePath();
    g.fillPath();

    // 칼날 중앙 하이라이트 선
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(13, midY - 0.5, w - 20, 1);

    g.generateTexture("tex-slash", w, h);
    g.destroy();
  }

  // 발밑 그림자 - 캐릭터/몬스터가 공중에 떠 보이지 않도록 아주 옅게 깔아준다.
  makeShadowTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(16, 6, 30, 10);
    g.generateTexture("tex-shadow", 32, 12);
    g.destroy();
  }

  // 나무/바위/수풀: 플레이어 이동을 막는 정적 장애물(엄폐 플레이).
  makeObstacleTextures() {
    // 나무: 갈색 밑동 + 초록 수관
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x5a3d24, 1);
    g.fillRect(13, 20, 6, 12);
    g.fillStyle(0x2f6b34, 1);
    g.fillCircle(16, 14, 14);
    g.fillStyle(0x3f8a46, 1);
    g.fillCircle(11, 10, 8);
    g.lineStyle(1, 0x1c3d1f, 0.5);
    g.strokeCircle(16, 14, 14);
    g.generateTexture("tex-obstacle-tree", 32, 34);
    g.destroy();

    // 바위: 각진 회색 덩어리
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x7a7a82, 1);
    g.fillTriangle(2, 22, 12, 4, 22, 22);
    g.fillTriangle(10, 22, 20, 8, 28, 22);
    g.fillStyle(0x9a9aa2, 1);
    g.fillTriangle(4, 22, 12, 10, 18, 22);
    g.lineStyle(1, 0x3a3a40, 0.5);
    g.strokeTriangle(2, 22, 12, 4, 22, 22);
    g.generateTexture("tex-obstacle-rock", 30, 24);
    g.destroy();

    // 수풀: 초록 덩어리 3개가 겹친 형태
    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2f6b34, 1);
    g.fillCircle(9, 14, 9);
    g.fillCircle(21, 14, 9);
    g.fillCircle(15, 9, 10);
    g.lineStyle(1, 0x1c3d1f, 0.5);
    g.strokeCircle(15, 9, 10);
    g.generateTexture("tex-obstacle-bush", 30, 24);
    g.destroy();
  }

  // 상점: 단색 사각형 대신 시장 텐트 모양으로 - 줄무늬 지붕 + 입구
  makeShopTexture() {
    const w = 56;
    const h = 48;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0xcc7744, 1);
    g.fillTriangle(2, h * 0.55, w / 2, 2, w - 2, h * 0.55);
    g.fillStyle(0xe0955c, 1);
    g.fillTriangle(w * 0.28, h * 0.55, w * 0.5, h * 0.16, w * 0.5, h * 0.55);

    g.fillStyle(0x3a2a1f, 1);
    g.fillTriangle(w * 0.4, h * 0.55, w * 0.5, h * 0.3, w * 0.6, h * 0.55);

    g.fillStyle(0x6b4f31, 1);
    g.fillRect(w * 0.04, h * 0.55, w * 0.92, h * 0.14);

    g.lineStyle(2, 0x0b0b0d, 0.35);
    g.strokeTriangle(2, h * 0.55, w / 2, 2, w - 2, h * 0.55);

    g.generateTexture("tex-shop", w, h);
    g.destroy();
  }

  // 퀘스트 담당자 NPC: 로브를 입은 사람 실루엣 + 머리 위에 뜨는 "!" 표식(고전 MMORPG 관례)
  makeQuestNpcTexture() {
    const w = 30;
    const h = 40;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0x5a4a8a, 1);
    g.fillTriangle(w * 0.5, h * 0.35, w * 0.15, h, w * 0.85, h);
    g.fillStyle(0xe8b98a, 1);
    g.fillCircle(w * 0.5, h * 0.25, w * 0.22);
    g.fillStyle(0x453870, 1);
    g.fillTriangle(w * 0.5, h * 0.02, w * 0.32, h * 0.22, w * 0.68, h * 0.22);
    g.lineStyle(1, 0x0b0b0d, 0.4);
    g.strokeTriangle(w * 0.5, h * 0.35, w * 0.15, h, w * 0.85, h);

    g.generateTexture("tex-quest-npc", w, h);
    g.destroy();
  }

  makeQuestMarkTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffe066, 1);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0x0b0b0d, 1);
    g.fillRect(7, 3, 2, 7);
    g.fillRect(7, 12, 2, 2);
    g.generateTexture("tex-quest-mark", 16, 16);
    g.destroy();
  }

  // 타일셋: 기본 4종은 단색, GRASS_EDGE/DIRT_EDGE는 반점(디더) 패턴으로 그려서
  // 풀-흙 경계가 각진 사각형이 아니라 부드럽게 이어지는 것처럼 보이게 한다.
  makeTilesetTexture() {
    const indices = Object.values(TILE_TYPES);
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    indices.forEach((index) => {
      if (index === TILE_TYPES.GRASS_EDGE) {
        this.drawDitherTile(g, index, TILE_COLORS[TILE_TYPES.GRASS], TILE_COLORS[TILE_TYPES.DIRT]);
      } else if (index === TILE_TYPES.DIRT_EDGE) {
        this.drawDitherTile(g, index, TILE_COLORS[TILE_TYPES.DIRT], TILE_COLORS[TILE_TYPES.GRASS]);
      } else {
        g.fillStyle(TILE_COLORS[index], 1);
        g.fillRect(index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
        g.lineStyle(1, 0x000000, 0.15);
        g.strokeRect(index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
      }
    });

    g.generateTexture("tileset-tex", indices.length * TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  drawDitherTile(g, index, baseColor, blendColor) {
    const ox = index * TILE_SIZE;
    g.fillStyle(baseColor, 1);
    g.fillRect(ox, 0, TILE_SIZE, TILE_SIZE);

    // 체커 패턴 절반 중에서도 60%만 칠해서(전체 타일의 약 20%) 경계가 하드한 사각형
    // 대신 옅은 반점으로만 보이게 한다 - 처음엔 너무 진해서 맵 전체가 시끄러워 보였다.
    const block = 4;
    for (let by = 0; by < TILE_SIZE; by += block) {
      for (let bx = 0; bx < TILE_SIZE; bx += block) {
        const checker = ((bx / block + by / block) % 2) === 0;
        if (checker && Math.random() > 0.6) {
          g.fillStyle(blendColor, 1);
          g.fillRect(ox + bx, by, block, block);
        }
      }
    }
  }

  create() {
    this.moveKeys = this.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.input.on("pointerdown", (pointer) => this.handleAttack(pointer));

    // 숫자키 1~5로 핫바(인벤토리 앞 5칸)를 바로 장착/사용할 수 있게 함
    ["ONE", "TWO", "THREE", "FOUR", "FIVE"].forEach((keyName, index) => {
      this.input.keyboard.on(`keydown-${keyName}`, () => this.handleHotbarKey(index));
    });

    // 첫 클릭/키 입력에서 오디오 컨텍스트를 깨워둔다(브라우저 자동재생 정책 - 사용자 제스처 필요)
    this.input.once("pointerdown", () => unlockAudio());
    this.input.keyboard.once("keydown", () => unlockAudio());

    this.cameras.main.setZoom(DEFAULT_ZOOM);
    this.input.on("wheel", (_pointer, _objs, _dx, deltaY) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, MIN_ZOOM, MAX_ZOOM));
    });

    this.statusText = this.add
      .text(10, 10, "서버에 연결 중...", { font: "12px monospace", fill: "#8a8a92" })
      .setScrollFactor(0)
      .setDepth(TOP_DEPTH);

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
      onRequestQuest: () => this.network.requestQuest(),
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
    this.groundLayer.setDepth(-1000);
    this.applyWaterCollision();

    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
  }

  applyWaterCollision() {
    if (!this.groundLayer) return;
    const blocked = this.character.level < LEVEL_REQUIRED_FOR_SEA;
    this.groundLayer.setCollision(TILE_TYPES.WATER, blocked);
  }

  buildObstacles(obstacleList) {
    this.obstacleGroup = this.physics.add.staticGroup();

    obstacleList.forEach((o) => {
      const sprite = this.obstacleGroup.create(o.x, o.y, `tex-obstacle-${o.type}`);
      sprite.setDepth(o.y);
      sprite.body.setSize(sprite.width * 0.5, sprite.height * 0.35);
      sprite.body.setOffset(sprite.width * 0.25, sprite.height * 0.6);
      sprite.refreshBody();
    });
  }

  connect() {
    this.network = new Network({
      onInit: (data) => {
        this.buildTilemap(data.world);
        buildMinimapTerrain(data.world);
        this.buildObstacles(Object.values(data.obstacles));
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
        if (data.questNpc) {
          this.questNpcPosition = data.questNpc;
          this.spawnQuestNpcMarker(data.questNpc);
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
        entry.shadow.destroy();
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
      onMonsterProjectileCreated: (data) => this.spawnMonsterProjectile(data),
      onMonsterProjectileRemoved: ({ id }) => {
        const p = this.monsterProjectiles.get(id);
        if (p) {
          p.sprite.destroy();
          this.monsterProjectiles.delete(id);
        }
      },
      onMonsterSpawned: (m) => this.spawnMonster(m),
      onMonsterDamaged: ({ id, hp, maxHp }) => {
        const entry = this.monsters.get(id);
        const previousHp = entry?.lastHp ?? hp;
        this.updateMonsterHp(id, hp, maxHp);
        this.flashMonster(id);
        playHitSound();
        if (entry) this.spawnDamageText(entry.sprite.x, entry.sprite.y, Math.max(0, previousHp - hp), "#ffe066");
      },
      onMonsterDied: ({ id }) => this.removeMonster(id),
      onMonsterAttack: ({ id }) => this.lungeMonster(id),
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
      onPlayerHit: ({ id, x, y, amount }) => {
        this.spawnDamageText(x, y, amount, "#ff6b6b");
        playHitSound();
        if (id === this.network.id) this.flashLocalPlayer();
        else this.flashRemotePlayer(id);
      },
      onPlayerDied: ({ id }) => {
        if (id !== this.network.id) {
          const entry = this.remotePlayers.get(id);
          if (entry) showToast(`플레이어가 쓰러졌습니다`);
        }
      },
      onRespawn: ({ x, y, hp, maxHp, gold }) => this.handleRespawn(x, y, hp, maxHp, gold),
      onQuestCompleted: ({ monsterType, goldReward, xpReward }) => {
        const name = MONSTER_NAMES[monsterType] ?? monsterType;
        showToast(`퀘스트 완료! ${name} 처치 - 골드 +${goldReward}, XP +${xpReward}. 새 퀘스트는 담당자에게!`);
        playLevelUpSound();
      },
      onQuestFailed: ({ reason }) => {
        if (reason === "too_far") showToast("퀘스트 담당자에게 가까이 가야 합니다");
      },
    });
  }

  applyCharacterState(state, leveledUp) {
    Object.assign(this.character, state);
    delete this.character.leveledUp;

    this.applyWaterCollision();

    const xpToNext = this.character.level >= MAX_LEVEL ? 1 : xpToReachLevel(this.character.level + 1);
    renderCharacter(this.character, xpToNext);

    if (leveledUp) {
      showToast(`레벨 업! Lv.${this.character.level}`);
      playLevelUpSound();
    }

    this.updateLocalHpBar();
    saveCharacter(this.character);
  }

  refreshStatus() {
    this.statusText.setText(`플레이어 수: ${this.remotePlayers.size + 1}`);
  }

  spawnLocalPlayer(state) {
    this.localShadow = this.add.image(state.x, state.y, "tex-shadow");

    const sprite = this.physics.add.image(state.x, state.y, "tex-player");
    sprite.setTint(state.color ?? 0xffffff);
    sprite._pjhColor = state.color ?? 0xffffff; // flashLocalPlayer가 피격 플래시 후 되돌릴 원래 색
    sprite.setCollideWorldBounds(true);
    this.localPlayer = sprite;

    // 몬스터처럼 내 캐릭터 머리 위에도 HP바를 띄운다(HUD 구석 대신 캐릭터를 볼 때도 체력이 보이게)
    this.localHpBg = this.add.rectangle(state.x, state.y - 26, 28, 4, 0x000000, 0.5).setDepth(LABEL_DEPTH);
    this.localHpFill = this.add
      .rectangle(state.x - 14, state.y - 26, 28, 4, 0x55ff88)
      .setOrigin(0, 0.5)
      .setDepth(LABEL_DEPTH);
    this.updateLocalHpBar();

    this.cameras.main.startFollow(sprite, true, 0.15, 0.15);

    if (this.groundLayer) {
      this.physics.add.collider(sprite, this.groundLayer);
    }
    if (this.obstacleGroup) {
      this.physics.add.collider(sprite, this.obstacleGroup);
    }
  }

  updateLocalHpBar() {
    if (!this.localHpFill) return;
    const ratio = this.character.maxHp > 0 ? Math.max(0, this.character.hp / this.character.maxHp) : 0;
    this.localHpFill.width = 28 * ratio;
  }

  spawnRemotePlayer(id, state) {
    const shadow = this.add.image(state.x, state.y, "tex-shadow");
    const sprite = this.add.image(state.x, state.y, "tex-player");
    const color = state.color ?? 0xaaaaaa;
    sprite.setTint(color);
    sprite._pjhColor = color; // flashRemotePlayer가 피격 플래시 후 원래 색으로 되돌릴 때 씀
    const label = this.add
      .text(state.x, state.y - 24, `Lv.${state.level ?? 1}`, { font: "10px monospace", fill: "#8a8a92" })
      .setOrigin(0.5)
      .setDepth(LABEL_DEPTH);

    this.remotePlayers.set(id, {
      sprite,
      shadow,
      label,
      target: { x: state.x, y: state.y, rotation: state.rotation ?? 0 },
    });
  }

  spawnMonster(state) {
    const visual = MONSTER_VISUALS[state.type] ?? MONSTER_VISUALS.slime;
    const shadow = this.add.image(state.x, state.y, "tex-shadow");
    const sprite = this.add.image(state.x, state.y, `tex-monster-${state.type}`);
    const hpBg = this.add.rectangle(state.x, state.y - 20, 24, 4, 0x000000, 0.5).setDepth(LABEL_DEPTH);
    const hpFill = this.add.rectangle(state.x - 12, state.y - 20, 24, 4, 0xff5577).setOrigin(0, 0.5).setDepth(LABEL_DEPTH);

    this.monsters.set(state.id, {
      sprite,
      shadow,
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

  // 몬스터의 접촉 공격이 그냥 조용히 체력만 깎는 게 아니라 실제로 "공격했다"는 게 보이도록,
  // 맞는 쪽(플레이어)의 빨간 피격 플래시와는 별개로 때리는 쪽(몬스터)도 주황색으로 잠깐
  // 부풀었다 가라앉는 연출을 준다.
  lungeMonster(id) {
    const entry = this.monsters.get(id);
    if (!entry) return;

    entry.sprite.setTint(0xffaa33);
    this.tweens.add({
      targets: entry.sprite,
      scale: 1.35,
      duration: 90,
      yoyo: true,
      onComplete: () => {
        if (entry.sprite.active) {
          entry.sprite.setScale(1);
          entry.sprite.clearTint();
        }
      },
    });
  }

  flashMonster(id) {
    const entry = this.monsters.get(id);
    if (!entry) return;
    entry.sprite.setTintFill(0xffffff);
    this.time.delayedCall(80, () => {
      if (entry.sprite.active) entry.sprite.clearTint();
    });
  }

  // 몬스터/플레이어가 맞을 때 위로 떠오르며 사라지는 데미지 숫자
  spawnDamageText(x, y, amount, color) {
    if (!amount) return;
    const text = this.add
      .text(x, y - 16, `-${amount}`, { font: "bold 13px monospace", fill: color })
      .setOrigin(0.5)
      .setDepth(TOP_DEPTH);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 600,
      ease: "Cubic.Out",
      onComplete: () => text.destroy(),
    });
  }

  flashLocalPlayer() {
    if (!this.localPlayer) return;
    const originalColor = this.localPlayer._pjhColor ?? 0xffffff;
    this.localPlayer.setTintFill(0xff5555);
    this.time.delayedCall(90, () => {
      if (this.localPlayer?.active) this.localPlayer.setTint(originalColor);
    });
  }

  flashRemotePlayer(id) {
    const entry = this.remotePlayers.get(id);
    if (!entry) return;
    const originalColor = entry.sprite._pjhColor ?? 0xaaaaaa;
    entry.sprite.setTintFill(0xff5555);
    this.time.delayedCall(90, () => {
      if (entry.sprite.active) entry.sprite.setTint(originalColor);
    });
  }

  // 사망 -> 부활: 서버가 정해준 위치로 즉시 순간이동시키고, 잠깐 무적임을 깜빡임으로 보여준다.
  handleRespawn(x, y, hp, maxHp, gold) {
    if (!this.localPlayer) return;

    this.localPlayer.x = x;
    this.localPlayer.y = y;
    this.localPlayer.body.setVelocity(0, 0);
    this.character.hp = hp;
    this.character.maxHp = maxHp;
    this.character.gold = gold;
    this.updateLocalHpBar();

    // characterUpdated와 별도 이벤트라 applyCharacterState를 안 거치므로 HUD DOM도 직접 갱신해야 함
    // (실제로 이 줄을 빠뜨려서 부활 후에도 HUD가 사망 직전 체력에 멈춰 있던 버그가 있었음)
    const xpToNext = this.character.level >= MAX_LEVEL ? 1 : xpToReachLevel(this.character.level + 1);
    renderCharacter(this.character, xpToNext);
    saveCharacter(this.character);

    showToast("쓰러졌습니다... 마을 근처에서 부활 (골드 10% 손실)");

    this.tweens.add({
      targets: this.localPlayer,
      alpha: 0.3,
      duration: 120,
      yoyo: true,
      repeat: 6,
      onComplete: () => {
        if (this.localPlayer?.active) this.localPlayer.setAlpha(1);
      },
    });
  }

  removeMonster(id) {
    const entry = this.monsters.get(id);
    if (!entry) return;

    entry.shadow.destroy();
    entry.hpBg.destroy();
    entry.hpFill.destroy();

    this.tweens.add({
      targets: entry.sprite,
      alpha: 0,
      scale: 0.4,
      duration: 200,
      onComplete: () => entry.sprite.destroy(),
    });
    this.monsters.delete(id);
  }

  spawnArrow(arrow) {
    const sprite = this.add.image(arrow.x, arrow.y, "tex-arrow");
    sprite.setTint(0xe8d9a0);
    sprite.setRotation(arrow.angle);
    sprite.setDepth(TOP_DEPTH);

    this.arrows.set(arrow.id, {
      sprite,
      vx: Math.cos(arrow.angle) * ARROW_SPEED,
      vy: Math.sin(arrow.angle) * ARROW_SPEED,
      expireAt: this.time.now + ARROW_LIFETIME_MS,
      trailTimer: 0,
    });
  }

  spawnMonsterProjectile(data) {
    const sprite = this.add.image(data.x, data.y, "tex-monster-projectile");
    sprite.setDepth(TOP_DEPTH);

    this.monsterProjectiles.set(data.id, {
      sprite,
      vx: Math.cos(data.angle) * data.speed,
      vy: Math.sin(data.angle) * data.speed,
      expireAt: this.time.now + MONSTER_PROJECTILE_LIFETIME_MS,
    });
  }

  playMeleeSwing(x, y, angle) {
    // 손잡이+가드+칼날 색이 이미 텍스처에 칠해져 있어서(브라운 손잡이, 은색 칼날) 여기서
    // setTint를 하면 색이 단색으로 뭉개지므로 원래 색 그대로 둔다.
    const slash = this.add.image(x, y, "tex-slash");
    slash.setOrigin(0, 0.5);
    slash.rotation = angle - 0.7;
    slash.setAlpha(1);
    slash.setDepth(TOP_DEPTH);

    // rotation을 Phaser 트윈의 대상 속성으로 직접 넘기면 안 된다: 조준각이 ±π 근처(왼쪽 방향)일 때
    // Phaser가 절대값 기준으로 "최단 경로"를 잘못 골라서 반대쪽(오른쪽)으로 한 바퀴 거의 다 도는
    // 버그가 있었다. 대신 alpha/scale만 트윈하고, 회전은 tween.progress로 직접 선형 계산해서
    // Phaser의 각도 보간 로직을 아예 거치지 않게 한다.
    const startRotation = angle - 0.7;
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: 1.15,
      duration: 180,
      onUpdate: (tween) => {
        slash.rotation = startRotation + tween.progress * 1.4;
      },
      onComplete: () => slash.destroy(),
    });
  }

  spawnWorldItem(item) {
    const sprite = this.add.image(item.x, item.y, "tex-item");
    sprite.setDepth(ITEM_DEPTH);
    if (item.itemId) sprite.setTint(0xff66aa); // 장비/물약
    else if (item.gold > 0) sprite.setTint(0xffd700); // 골드
    else sprite.setTint(0x66ccff); // XP 조각
    this.worldItemSprites.set(item.id, sprite);
  }

  // 상점은 이 위치 반경(SHOP_INTERACT_RADIUS) 안에 있을 때만 이용 가능하다(서버가 최종 검증).
  spawnShopMarker(pos) {
    const tent = this.add.image(pos.x, pos.y, "tex-shop").setOrigin(0.5, 0.85);
    tent.setDepth(pos.y);
    this.add
      .text(pos.x, pos.y - TILE_SIZE * 1.6, "상점", { font: "12px monospace", fill: "#0b0b0d", backgroundColor: "#ffd700" })
      .setOrigin(0.5)
      .setPadding(3, 1, 3, 1)
      .setDepth(LABEL_DEPTH);
  }

  spawnQuestNpcMarker(pos) {
    const npc = this.add.image(pos.x, pos.y, "tex-quest-npc").setOrigin(0.5, 0.95);
    npc.setDepth(pos.y);
    npc.setInteractive({ useHandCursor: true }); // 클릭해서 말을 걸 수 있게(handleAttack에서 공격보다 먼저 검사)
    this.questNpcSprite = npc;
    const shadow = this.add.image(pos.x, pos.y, "tex-shadow");
    shadow.setDepth(pos.y - 0.5);

    const mark = this.add.image(pos.x, pos.y - 46, "tex-quest-mark").setDepth(LABEL_DEPTH);
    this.tweens.add({
      targets: mark,
      y: pos.y - 52,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  handleAttack(pointer) {
    if (!this.localPlayer || !this.network || this.menuOpen) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    // NPC를 클릭하면 공격 대신 대화창을 연다 - 가까이 있을 때만(멀리서 줌아웃해서 클릭하는 건 방지)
    if (this.questNpcSprite && this.questNpcNear && this.questNpcSprite.getBounds().contains(worldPoint.x, worldPoint.y)) {
      this.talkToQuestNpc();
      return;
    }

    if (this.time.now - this.lastAttackTime < ATTACK_COOLDOWN_MS) return;
    this.lastAttackTime = this.time.now;

    const angle = Phaser.Math.Angle.Between(this.localPlayer.x, this.localPlayer.y, worldPoint.x, worldPoint.y);

    const weaponId = this.character.equipped.weapon;
    const weaponDef = weaponId ? ITEMS[weaponId] : null;

    if (weaponDef?.attackType === "ranged") {
      this.network.sendRangedAttack(angle);
      playArrowShotSound();
    } else {
      this.network.sendMeleeAttack(angle);
      playSwordSwingSound();
    }
  }

  talkToQuestNpc() {
    toggleNpcDialogue();
  }

  // 숫자키 1~5: 핫바(인벤토리 앞 5칸)의 아이템을 클릭한 것과 똑같이 장착/사용한다.
  handleHotbarKey(index) {
    if (!this.network) return;
    const slot = this.character.inventory[index];
    const def = slot && ITEMS[slot.itemId];
    if (!def) return;

    if (def.type === "consumable") this.network.useItem(index);
    else this.network.equipItem(index);
  }

  update(time, delta) {
    if (this.localPlayer && !this.menuOpen) {
      this.handleMovement();
      this.faceMouse();
      this.sendMovementIfChanged(time);
      this.checkItemPickups();
    }

    if (this.localPlayer) {
      this.localPlayer.setDepth(this.localPlayer.y);
      this.localShadow.setPosition(this.localPlayer.x, this.localPlayer.y + 12);
      this.localShadow.setDepth(this.localPlayer.y - 0.5);
      this.localHpBg.setPosition(this.localPlayer.x, this.localPlayer.y - 26);
      this.localHpFill.setPosition(this.localPlayer.x - 14, this.localPlayer.y - 26);
    }

    this.interpolateRemotePlayers();
    this.interpolateMonsters();
    this.updateArrows(time, delta);
    this.updateMonsterProjectiles(time, delta);
    this.updateMinimap();
    this.updateShopProximityCheck();
    this.updateQuestNpcProximityCheck();
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

  updateQuestNpcProximityCheck() {
    if (!this.localPlayer || !this.questNpcPosition) return;
    const dist = Phaser.Math.Distance.Between(
      this.localPlayer.x,
      this.localPlayer.y,
      this.questNpcPosition.x,
      this.questNpcPosition.y
    );
    const near = dist <= SHOP_INTERACT_RADIUS; // 상점과 같은 반경 재사용
    if (near !== this.questNpcNear) {
      this.questNpcNear = near;
      updateQuestNpcProximity(near);
    }
  }

  updateMinimap() {
    if (!this.localPlayer) return;
    const remotePositions = [];
    this.remotePlayers.forEach(({ sprite }) => remotePositions.push({ x: sprite.x, y: sprite.y }));
    renderMinimap({
      localPos: { x: this.localPlayer.x, y: this.localPlayer.y },
      shopPos: this.shopPosition,
      questNpcPos: this.questNpcPosition,
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
      const tile = this.currentTileType();
      if (tile === TILE_TYPES.WATER) speed *= WATER_SPEED_MULTIPLIER;
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
        playPickupSound();
      }
    });
  }

  interpolateRemotePlayers() {
    this.remotePlayers.forEach(({ sprite, shadow, label, target }) => {
      sprite.x = Phaser.Math.Linear(sprite.x, target.x, 0.25);
      sprite.y = Phaser.Math.Linear(sprite.y, target.y, 0.25);
      sprite.rotation = target.rotation;
      sprite.setDepth(sprite.y);
      shadow.setPosition(sprite.x, sprite.y + 12);
      shadow.setDepth(sprite.y - 0.5);
      label.x = sprite.x;
      label.y = sprite.y - 24;
    });
  }

  interpolateMonsters() {
    this.monsters.forEach(({ sprite, shadow, hpBg, hpFill, target }) => {
      sprite.x = Phaser.Math.Linear(sprite.x, target.x, 0.1);
      sprite.y = Phaser.Math.Linear(sprite.y, target.y, 0.1);
      sprite.setDepth(sprite.y);
      shadow.setPosition(sprite.x, sprite.y + 10);
      shadow.setDepth(sprite.y - 0.5);
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

      // 아주 옅은 잔상을 주기적으로 남겨 날아가는 궤적이 눈에 잘 띄게 한다.
      arrow.trailTimer += delta;
      if (arrow.trailTimer > 30) {
        arrow.trailTimer = 0;
        const ghost = this.add.image(arrow.sprite.x, arrow.sprite.y, "tex-arrow");
        ghost.setRotation(arrow.sprite.rotation);
        ghost.setTint(0xe8d9a0);
        ghost.setAlpha(0.3);
        ghost.setDepth(TOP_DEPTH - 1);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      }

      if (time > arrow.expireAt) {
        arrow.sprite.destroy();
        this.arrows.delete(id);
      }
    });
  }

  updateMonsterProjectiles(time, delta) {
    const dt = delta / 1000;
    this.monsterProjectiles.forEach((p, id) => {
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;

      if (time > p.expireAt) {
        p.sprite.destroy();
        this.monsterProjectiles.delete(id);
      }
    });
  }
}
