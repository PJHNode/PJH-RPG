// 오디오 파일 없이 Web Audio API 오실레이터로 만든 효과음. 브라우저 자동재생 정책 때문에
// 반드시 사용자 제스처(클릭/키 입력) 이후에 unlockAudio()가 한 번 호출돼야 소리가 난다
// (GameScene.create()에서 최초 pointerdown/keydown에 걸어둠).

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockAudio() {
  getCtx();
}

function tone({ freq, duration, type = "sine", startGain = 0.12, endFreq, attack = 0.005 }) {
  const audio = getCtx();
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), now + duration);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(startGain, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function playSwordSwingSound() {
  tone({ freq: 520, endFreq: 180, duration: 0.12, type: "sawtooth", startGain: 0.07 });
}

export function playArrowShotSound() {
  tone({ freq: 900, endFreq: 1500, duration: 0.07, type: "triangle", startGain: 0.08 });
}

export function playHitSound() {
  tone({ freq: 160, endFreq: 55, duration: 0.1, type: "square", startGain: 0.1 });
}

export function playPickupSound() {
  tone({ freq: 700, endFreq: 1000, duration: 0.06, type: "sine", startGain: 0.06 });
}

export function playDashSound() {
  tone({ freq: 260, endFreq: 900, duration: 0.1, type: "sine", startGain: 0.06 });
}

export function playAoeSkillSound() {
  tone({ freq: 240, endFreq: 50, duration: 0.28, type: "sawtooth", startGain: 0.1 });
}

export function playLevelUpSound() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    setTimeout(() => tone({ freq, duration: 0.18, type: "triangle", startGain: 0.09 }), i * 90);
  });
}
