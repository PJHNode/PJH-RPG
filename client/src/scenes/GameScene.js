import { WORLD, PLAYER_SPEED, BULLET_SPEED, BULLET_LIFETIME_MS, MOVE_SEND_INTERVAL_MS } from "../config.js";
import Network from "../network.js";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init() {
    this.network = null;
    this.localPlayer = null;
    this.remotePlayers = new Map(); // id -> { sprite, label, target: {x,y,rotation} }
    this.bullets = new Map(); // bulletId -> { sprite, vx, vy, expireAt }
    this.lastSend = { x: null, y: null, rotation: null, time: 0 };
  }

  preload() {
    this.makeCircleTexture("tex-player", 14, 0xffffff);
    this.makeCircleTexture("tex-bullet", 5, 0xffe066);
  }

  makeCircleTexture(key, radius, color) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.drawGrid();

    this.moveKeys = this.input.keyboard.addKeys({
      up: "W",
      down: "S",
      left: "A",
      right: "D",
    });
    this.cursorKeys = this.input.keyboard.createCursorKeys();

    this.input.on("pointerdown", (pointer) => this.handleShoot(pointer));

    this.statusText = this.add
      .text(10, 10, "서버에 연결 중...", { font: "14px monospace", fill: "#8a8a92" })
      .setScrollFactor(0)
      .setDepth(1000);

    this.connect();
  }

  drawGrid() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x1c1c22, 1);
    const step = 64;
    for (let x = 0; x <= WORLD.width; x += step) g.lineBetween(x, 0, x, WORLD.height);
    for (let y = 0; y <= WORLD.height; y += step) g.lineBetween(0, y, WORLD.width, y);
    g.lineStyle(2, 0x3a3a42, 1);
    g.strokeRect(0, 0, WORLD.width, WORLD.height);
  }

  connect() {
    this.network = new Network({
      onInit: (data) => {
        this.spawnLocalPlayer(data.players[data.id]);
        Object.entries(data.players).forEach(([id, state]) => {
          if (id === data.id) return;
          this.spawnRemotePlayer(id, state);
        });
        this.refreshStatus();
      },
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
      onPlayerLeft: ({ id }) => {
        const entry = this.remotePlayers.get(id);
        if (!entry) return;
        entry.sprite.destroy();
        entry.label.destroy();
        this.remotePlayers.delete(id);
        this.refreshStatus();
      },
      onBulletCreated: (bullet) => this.spawnBullet(bullet),
    });
  }

  refreshStatus() {
    this.statusText.setText(`플레이어 수: ${this.remotePlayers.size + 1}`);
  }

  spawnLocalPlayer(state) {
    const sprite = this.physics.add.image(state.x, state.y, "tex-player");
    sprite.setTint(state.color ?? 0xffffff);
    sprite.setCollideWorldBounds(true);
    this.localPlayer = sprite;

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
  }

  spawnRemotePlayer(id, state) {
    const sprite = this.add.image(state.x, state.y, "tex-player");
    sprite.setTint(state.color ?? 0xaaaaaa);
    const label = this.add
      .text(state.x, state.y - 24, id.slice(0, 4), { font: "10px monospace", fill: "#8a8a92" })
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
    }

    this.interpolateRemotePlayers();
    this.updateBullets(time, delta);
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
      vx = (vx / len) * PLAYER_SPEED;
      vy = (vy / len) * PLAYER_SPEED;
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
