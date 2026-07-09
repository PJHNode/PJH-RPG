// Socket.io 연결을 얇게 감싸서 GameScene이 이벤트 이름을 직접 다루지 않게 한다.
export default class Network {
  constructor(handlers) {
    this.socket = io();
    this.id = null;

    this.socket.on("init", (data) => {
      this.id = data.id;
      handlers.onInit?.(data);
    });
    this.socket.on("playerJoined", (data) => handlers.onPlayerJoined?.(data));
    this.socket.on("playerMoved", (data) => handlers.onPlayerMoved?.(data));
    this.socket.on("playerLeft", (data) => handlers.onPlayerLeft?.(data));
    this.socket.on("playerLevelChanged", (data) => handlers.onPlayerLevelChanged?.(data));

    this.socket.on("meleeAttack", (data) => handlers.onMeleeAttack?.(data));
    this.socket.on("arrowCreated", (data) => handlers.onArrowCreated?.(data));
    this.socket.on("arrowRemoved", (data) => handlers.onArrowRemoved?.(data));

    this.socket.on("monsterSpawned", (data) => handlers.onMonsterSpawned?.(data));
    this.socket.on("monsterDamaged", (data) => handlers.onMonsterDamaged?.(data));
    this.socket.on("monsterDied", (data) => handlers.onMonsterDied?.(data));
    this.socket.on("monstersUpdated", (data) => handlers.onMonstersUpdated?.(data));
    this.socket.on("monsterAttack", (data) => handlers.onMonsterAttack?.(data));
    this.socket.on("aoeAttack", (data) => handlers.onAoeAttack?.(data));
    this.socket.on("monsterProjectileCreated", (data) => handlers.onMonsterProjectileCreated?.(data));
    this.socket.on("monsterProjectileRemoved", (data) => handlers.onMonsterProjectileRemoved?.(data));

    this.socket.on("itemSpawned", (data) => handlers.onItemSpawned?.(data));
    this.socket.on("itemRemoved", (data) => handlers.onItemRemoved?.(data));
    this.socket.on("characterReady", (data) => handlers.onCharacterReady?.(data));
    this.socket.on("characterUpdated", (data) => handlers.onCharacterUpdated?.(data));
    this.socket.on("pickupFailed", (data) => handlers.onPickupFailed?.(data));
    this.socket.on("shopFailed", (data) => handlers.onShopFailed?.(data));
    this.socket.on("questFailed", (data) => handlers.onQuestFailed?.(data));

    this.socket.on("playerHit", (data) => handlers.onPlayerHit?.(data));
    this.socket.on("playerDied", (data) => handlers.onPlayerDied?.(data));
    this.socket.on("respawn", (data) => handlers.onRespawn?.(data));
    this.socket.on("questCompleted", (data) => handlers.onQuestCompleted?.(data));
  }

  sendMovement(x, y, rotation) {
    this.socket.emit("playerMovement", { x, y, rotation });
  }

  sendMeleeAttack(angle) {
    this.socket.emit("meleeAttack", { angle });
  }

  sendRangedAttack(angle) {
    this.socket.emit("rangedAttack", { angle });
  }

  sendDash() {
    this.socket.emit("dash");
  }

  sendAoeAttack() {
    this.socket.emit("aoeAttack");
  }

  loadCharacter(character) {
    this.socket.emit("loadCharacter", character);
  }

  pickupItem(id) {
    this.socket.emit("pickupItem", { id });
  }

  equipItem(slotIndex) {
    this.socket.emit("equipItem", slotIndex);
  }

  useItem(slotIndex) {
    this.socket.emit("useItem", slotIndex);
  }

  buyItem(itemId) {
    this.socket.emit("buyItem", itemId);
  }

  sellItem(slotIndex) {
    this.socket.emit("sellItem", slotIndex);
  }

  requestQuest() {
    this.socket.emit("requestQuest");
  }

  adminSetGold(value) {
    this.socket.emit("adminSetGold", value);
  }

  adminSetLevel(value) {
    this.socket.emit("adminSetLevel", value);
  }
}
