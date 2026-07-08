// shared/leveling.js와 값을 동일하게 유지할 것. 클라이언트는 표시(XP 바 계산)용으로만 쓰고,
// 레벨업 판정 자체는 서버(applyXp)가 authoritative하게 수행한다.

export const BASE_XP = 60;
export const XP_GROWTH = 1.6;
export const MAX_LEVEL = 10;
export const HP_PER_LEVEL = 8;
export const BASE_MAX_HP = 20;

export function xpToReachLevel(level) {
  return Math.floor(BASE_XP * Math.pow(level, XP_GROWTH));
}

export function maxHpForLevel(level) {
  return BASE_MAX_HP + (level - 1) * HP_PER_LEVEL;
}
