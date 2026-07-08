// client/src/leveling.js와 값(BASE_XP, XP_GROWTH, HP_PER_LEVEL, BASE_MAX_HP, MAX_LEVEL)을
// 동일하게 유지할 것. 서버만 applyXp(레벨업 판정 및 상태 변경)를 실제로 수행하고,
// 클라이언트는 표시용으로 xpToReachLevel만 계산한다.

const BASE_XP = 60;
const XP_GROWTH = 1.6;
const MAX_LEVEL = 10; // 시작의 섬에서 도달 가능한 최대 레벨
const HP_PER_LEVEL = 8;
const BASE_MAX_HP = 20;

// 레벨 (level-1) -> level 로 올라가는 데 필요한 증분 XP
function xpToReachLevel(level) {
  return Math.floor(BASE_XP * Math.pow(level, XP_GROWTH));
}

function maxHpForLevel(level) {
  return BASE_MAX_HP + (level - 1) * HP_PER_LEVEL;
}

// state: { level, xp, hp, maxHp } 를 직접 변경한다. 레벨업 여부(boolean)를 반환.
function applyXp(state, amount) {
  state.xp += amount;
  let leveledUp = false;

  while (state.level < MAX_LEVEL) {
    const need = xpToReachLevel(state.level + 1);
    if (state.xp < need) break;

    state.xp -= need;
    state.level += 1;
    state.maxHp = maxHpForLevel(state.level);
    state.hp = state.maxHp; // 레벨업 시 풀피 회복
    leveledUp = true;
  }

  if (state.level >= MAX_LEVEL) {
    state.xp = 0; // 캡 도달 후에는 더 쌓지 않음 (다음 맵 확장 때 재설계)
  }

  return leveledUp;
}

module.exports = {
  BASE_XP,
  XP_GROWTH,
  MAX_LEVEL,
  HP_PER_LEVEL,
  BASE_MAX_HP,
  xpToReachLevel,
  maxHpForLevel,
  applyXp,
};
