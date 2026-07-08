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
    this.socket.on("bulletCreated", (data) => handlers.onBulletCreated?.(data));
    this.socket.on("itemSpawned", (data) => handlers.onItemSpawned?.(data));
    this.socket.on("itemRemoved", (data) => handlers.onItemRemoved?.(data));
    this.socket.on("characterReady", (data) => handlers.onCharacterReady?.(data));
    this.socket.on("characterUpdated", (data) => handlers.onCharacterUpdated?.(data));
    this.socket.on("pickupFailed", (data) => handlers.onPickupFailed?.(data));
  }

  sendMovement(x, y, rotation) {
    this.socket.emit("playerMovement", { x, y, rotation });
  }

  sendShoot(x, y, angle) {
    this.socket.emit("shoot", { x, y, angle });
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
}
