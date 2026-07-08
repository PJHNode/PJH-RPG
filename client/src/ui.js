import { ITEMS } from "./items.js";

const HOTBAR_SIZE = 5;

// ---- HUD ----
const hpFill = document.getElementById("hp-fill");
const hpText = document.getElementById("hp-text");
const xpFill = document.getElementById("xp-fill");
const levelText = document.getElementById("level-text");
const goldText = document.getElementById("gold-text");

// ---- 핫바 / 장착 ----
const hotbarEl = document.getElementById("hotbar");
const equipWeaponEl = document.getElementById("equip-weapon");
const equipArmorEl = document.getElementById("equip-armor");

// ---- 인벤토리 모달 ----
const inventoryModal = document.getElementById("inventory-modal");
const inventoryGridEl = document.getElementById("inventory-grid");
const inventoryEquipRowEl = document.getElementById("inventory-equip-row");

// ---- 상점 모달 ----
const shopModal = document.getElementById("shop-modal");
const shopGoldAmountEl = document.getElementById("shop-gold-amount");
const shopBuyGridEl = document.getElementById("shop-buy-grid");
const shopSellGridEl = document.getElementById("shop-sell-grid");

// ---- 공통 ----
const backdrop = document.getElementById("modal-backdrop");
const toastEl = document.getElementById("toast");

let activeModal = null; // 'inventory' | 'shop' | null
let currentCharacter = null;
let uiHandlers = {};

export function initUI(handlers) {
  uiHandlers = handlers;

  document.getElementById("shop-button").addEventListener("click", () => toggleShop());
  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () => closeModals());
  });
  backdrop.addEventListener("click", () => closeModals());

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      toggleInventory();
    } else if (e.key === "Escape") {
      closeModals();
    }
  });

  renderShopBuyGrid();
}

function setActiveModal(name) {
  activeModal = name;
  inventoryModal.classList.toggle("hidden", name !== "inventory");
  shopModal.classList.toggle("hidden", name !== "shop");
  backdrop.classList.toggle("hidden", name === null);
  uiHandlers.onMenuOpenChange?.(name !== null);

  if (name && currentCharacter) {
    if (name === "inventory") renderInventoryModal(currentCharacter);
    if (name === "shop") renderShopModal(currentCharacter);
  }
}

export function toggleInventory() {
  setActiveModal(activeModal === "inventory" ? null : "inventory");
}

export function toggleShop() {
  setActiveModal(activeModal === "shop" ? null : "shop");
}

export function closeModals() {
  setActiveModal(null);
}

// character가 바뀔 때마다(이동 제외 전부) GameScene이 호출하는 단일 진입점
export function renderCharacter(character, xpToNext) {
  currentCharacter = character;

  levelText.textContent = `Lv.${character.level}`;
  goldText.textContent = character.gold;
  hpText.textContent = `${character.hp} / ${character.maxHp}`;
  hpFill.style.width = `${Math.max(0, (character.hp / character.maxHp) * 100)}%`;
  xpFill.style.width = `${Math.min(100, (character.xp / xpToNext) * 100)}%`;

  equipWeaponEl.textContent = character.equipped.weapon ? ITEMS[character.equipped.weapon].name : "무기 없음";
  equipArmorEl.textContent = character.equipped.armor ? ITEMS[character.equipped.armor].name : "방어구 없음";

  renderHotbar(character);
  if (activeModal === "inventory") renderInventoryModal(character);
  if (activeModal === "shop") renderShopModal(character);
}

function renderHotbar(character) {
  hotbarEl.innerHTML = "";
  character.inventory.slice(0, HOTBAR_SIZE).forEach((slot, index) => {
    hotbarEl.appendChild(makeSlotEl(slot, index));
  });
}

function renderInventoryModal(character) {
  inventoryGridEl.innerHTML = "";
  character.inventory.forEach((slot, index) => {
    inventoryGridEl.appendChild(makeSlotEl(slot, index));
  });

  inventoryEquipRowEl.innerHTML = "";
  const weaponBox = document.createElement("div");
  weaponBox.className = "equip-box";
  weaponBox.textContent = character.equipped.weapon ? `무기: ${ITEMS[character.equipped.weapon].name}` : "무기 없음";
  inventoryEquipRowEl.appendChild(weaponBox);

  const armorBox = document.createElement("div");
  armorBox.className = "equip-box";
  armorBox.textContent = character.equipped.armor ? `방어구: ${ITEMS[character.equipped.armor].name}` : "방어구 없음";
  inventoryEquipRowEl.appendChild(armorBox);
}

function makeSlotEl(slot, index) {
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
    slotEl.addEventListener("click", () => uiHandlers.onSlotClick?.(index, def));
  }

  return slotEl;
}

// 상점의 구매 목록(카탈로그 전체)은 골드와 무관하게 고정이라 초기 1회만 그린다.
function renderShopBuyGrid() {
  shopBuyGridEl.innerHTML = "";
  Object.values(ITEMS).forEach((def) => {
    const box = document.createElement("div");
    box.className = "shop-item";

    const icon = document.createElement("div");
    icon.className = "inv-icon";
    icon.style.background = colorToCss(def.color);
    icon.textContent = def.name[0];
    box.appendChild(icon);

    const label = document.createElement("div");
    label.className = "shop-item-label";
    label.textContent = `${def.name} - ${def.price}G`;
    box.appendChild(label);

    box.addEventListener("click", () => uiHandlers.onBuy?.(def.id));
    shopBuyGridEl.appendChild(box);
  });
}

function renderShopModal(character) {
  shopGoldAmountEl.textContent = character.gold;

  shopSellGridEl.innerHTML = "";
  character.inventory.forEach((slot, index) => {
    if (!slot) return;
    const def = ITEMS[slot.itemId];
    if (!def || typeof def.price !== "number") return;

    const box = document.createElement("div");
    box.className = "shop-item";

    const icon = document.createElement("div");
    icon.className = "inv-icon";
    icon.style.background = colorToCss(def.color);
    icon.textContent = def.name[0];
    box.appendChild(icon);

    const sellPrice = Math.max(1, Math.floor(def.price / 2));
    const label = document.createElement("div");
    label.className = "shop-item-label";
    label.textContent = `${def.name} (${slot.qty}개) - ${sellPrice}G에 판매`;
    box.appendChild(label);

    box.addEventListener("click", () => uiHandlers.onSell?.(index));
    shopSellGridEl.appendChild(box);
  });

  if (!shopSellGridEl.children.length) {
    const empty = document.createElement("div");
    empty.className = "shop-empty";
    empty.textContent = "판매할 아이템이 없습니다";
    shopSellGridEl.appendChild(empty);
  }
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
