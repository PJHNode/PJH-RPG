import GameScene from "./scenes/GameScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#0b0b0d",
  // 이 게임은 픽셀아트 기반이라, 텍스처를 확대/이동해도 블러 없이 각지게(nearest-neighbor)
  // 보이도록 pixelArt 모드를 켠다. placeholder 색상 도형도 이 설정 아래에서 만들어야 한다.
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);
window.__game = game; // 콘솔 디버깅/자동화 테스트용 (베타 단계 편의 기능)

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
