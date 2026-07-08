import { ITEMS } from "./items.js";

const hpFill = document.getElementById("hp-fill");
const hpText = document.getElementById("hp-text");
const xpFill = document.getElementById("xp-fill");
const levelText = document.getElementById("level-text");
const goldText = document.getElementById("gold-text");
const inventoryEl = document.getElementById("inventory-bar");
const weaponEl = document.getElementById("equip-weapon");
const armorEl = document.getElementById("equip-armor");
const toastEl = document.getElementById("toast");

export function renderHud(character, xpToNext) {
  levelText.textContent = `Lv.${character.level}`;
  goldText.textContent = character.gold;
  hpText.textContent = `${character.hp} / ${character.maxHp}`;
  hpFill.style.width = `${Math.max(0, (character.hp / character.maxHp) * 100)}%`;
  xpFill.style.width = `${Math.min(100, (character.xp / xpToNext) * 100)}%`;
}

export function renderInventory(character, handlers) {
  inventoryEl.innerHTML = "";

  character.inventory.forEach((slot, index) => {
    const slotEl = document.createElement("div");
    slotEl.className = "inv-slot";

    if (slot) {
      const def = ITEMS[slot.itemId];

      const icon = document.createElement("div");
      icon.className = "inv-icon";
      icon.style.background = colorToCss(def?.color ?? 0x888888);
      icon.textContent = def?.name?.[0] ?? "?";
      slotEl.appendChild(icon);

      if (slot.qty > 1) {
        const qty = document.createElement("span");
        qty.className = "inv-qty";
        qty.textContent = slot.qty;
        slotEl.appendChild(qty);
      }

      slotEl.title = def?.name ?? slot.itemId;
      slotEl.addEventListener("click", () => handlers.onSlotClick?.(index, def));
    }

    inventoryEl.appendChild(slotEl);
  });

  weaponEl.textContent = character.equipped.weapon ? ITEMS[character.equipped.weapon]?.name : "무기 없음";
  armorEl.textContent = character.equipped.armor ? ITEMS[character.equipped.armor]?.name : "방어구 없음";
}

let toastTimer = null;
export function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2000);
}

function colorToCss(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}
