import { INVENTORY_SIZE } from "./items.js";

const STORAGE_KEY = "pjh-rpg-character";

function createNewCharacter() {
  return {
    playerId: crypto.randomUUID(),
    level: 1,
    xp: 0,
    hp: 20,
    maxHp: 20,
    gold: 0,
    inventory: [{ itemId: "health_potion", qty: 3 }, ...new Array(INVENTORY_SIZE - 1).fill(null)],
    equipped: { weapon: "wooden_sword", armor: null },
  };
}

export function loadCharacter() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createNewCharacter();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createNewCharacter();

    return { ...createNewCharacter(), ...parsed };
  } catch {
    return createNewCharacter();
  }
}

export function saveCharacter(character) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(character));
  } catch {
    // 프라이빗 모드 등으로 localStorage를 못 쓰는 경우 조용히 무시
  }
}
