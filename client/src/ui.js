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

// ---- 상점 ----
const shopButton = document.getElementById("shop-button");
const shopHintEl = document.getElementById("shop-hint");
const shopModal = document.getElementById("shop-modal");
const shopGoldAmountEl = document.getElementById("shop-gold-amount");
const shopBuyGridEl = document.getElementById("shop-buy-grid");
const shopSellGridEl = document.getElementById("shop-sell-grid");

// ---- 어드민(베타 디버그) 패널 ----
const adminModal = document.getElementById("admin-modal");
const adminGoldInput = document.getElementById("admin-gold-input");
const adminLevelInput = document.getElementById("admin-level-input");

// ---- 공통 ----
const backdrop = document.getElementById("modal-backdrop");
const toastEl = document.getElementById("toast");

let activeModal = null; // 'inventory' | 'shop' | 'admin' | null
let currentCharacter = null;
let shopNear = false;
let uiHandlers = {};

export function initUI(handlers) {
  uiHandlers = handlers;

  shopButton.addEventListener("click", () => {
    if (!shopNear) {
      showToast("상점에 가까이 가야 이용할 수 있어요");
      return;
    }
    toggleShop();
  });

  document.getElementById("admin-button").addEventListener("click", () => toggleAdmin());
  document.getElementById("admin-apply-gold").addEventListener("click", () => {
    uiHandlers.onAdminSetGold?.(Number(adminGoldInput.value));
  });
  document.getElementById("admin-apply-level").addEventListener("click", () => {
    uiHandlers.onAdminSetLevel?.(Number(adminLevelInput.value));
  });

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
  updateShopProximity(false);
}

function setActiveModal(name) {
  activeModal = name;
  inventoryModal.classList.toggle("hidden", name !== "inventory");
  shopModal.classList.toggle("hidden", name !== "shop");
  adminModal.classList.toggle("hidden", name !== "admin");
  backdrop.classList.toggle("hidden", name === null);
  uiHandlers.onMenuOpenChange?.(name);

  if (name && currentCharacter) {
    if (name === "inventory") renderInventoryModal(currentCharacter);
    if (name === "shop") renderShopModal(currentCharacter);
    if (name === "admin") {
      adminGoldInput.value = currentCharacter.gold;
      adminLevelInput.value = currentCharacter.level;
    }
  }
}

export function toggleInventory() {
  setActiveModal(activeModal === "inventory" ? null : "inventory");
}

export function toggleShop() {
  setActiveModal(activeModal === "shop" ? null : "shop");
}

export function toggleAdmin() {
  setActiveModal(activeModal === "admin" ? null : "admin");
}

export function closeModals() {
  setActiveModal(null);
}

export function getActiveModal() {
  return activeModal;
}

// 상점 반경 안/밖으로 넘어갈 때 GameScene이 호출. 버튼 활성화 + 힌트 문구 + 밖으로
// 나가면 상점 모달을 자동으로 닫는다(서버도 어차피 거리 검증을 하지만 UX상 자연스럽게).
export function updateShopProximity(isNear) {
  if (isNear === shopNear) return;
  shopNear = isNear;

  shopButton.classList.toggle("disabled", !isNear);
  shopHintEl.classList.toggle("hidden", isNear);

  if (!isNear && activeModal === "shop") {
    closeModals();
    showToast("상점에서 멀어졌습니다");
  }
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
    const slotEl = makeSlotEl(slot, index);

    const hotkey = document.createElement("span");
    hotkey.className = "inv-hotkey";
    hotkey.textContent = index + 1;
    slotEl.appendChild(hotkey);

    hotbarEl.appendChild(slotEl);
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

    slotEl.appendChild(makeIconEl(def));

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

    box.appendChild(makeIconEl(def));

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

    box.appendChild(makeIconEl(def));

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

// 예전엔 색칠된 네모 안에 아이템 이름 첫 글자만 써서 "뭐가 뭔지 모르겠다"는 지적을 받았다.
// 대신 아이템 종류(근접무기/원거리무기/방어구/소비)별로 실루엣이 다른 작은 SVG 아이콘을 그린다.
function makeIconEl(def) {
  const icon = document.createElement("div");
  icon.className = "inv-icon";
  if (def) icon.innerHTML = iconMarkup(def);
  return icon;
}

function iconMarkup(def) {
  const color = colorToCss(def.color ?? 0x888888);

  if (def.type === "weapon" && def.attackType === "ranged") {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M7 3 Q17 12 7 21" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="7" y1="3" x2="7" y2="21" stroke="${color}" stroke-width="1"/>
    </svg>`;
  }

  if (def.type === "weapon") {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <g stroke="#0b0b0d" stroke-width="0.6" stroke-linejoin="round">
        <rect x="10.8" y="1" width="2.4" height="13" rx="1" fill="${color}" transform="rotate(45 12 9)"/>
        <rect x="6.5" y="13" width="7" height="2.2" rx="0.6" fill="#2a2a30" transform="rotate(45 10 14.1)"/>
        <rect x="3.5" y="16.5" width="2.2" height="5" rx="1" fill="#5a3d24" transform="rotate(45 4.6 19)"/>
      </g>
    </svg>`;
  }

  if (def.type === "armor") {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M12 2 L19 5 V11 C19 16.5 15.5 20 12 21 C8.5 20 5 16.5 5 11 V5 Z"
        fill="${color}" stroke="#0b0b0d" stroke-width="0.8"/>
    </svg>`;
  }

  // consumable (물약)
  return `<svg viewBox="0 0 24 24" width="20" height="20">
    <rect x="10" y="2" width="4" height="4" fill="${color}" stroke="#0b0b0d" stroke-width="0.6"/>
    <path d="M9 6 L15 6 L17.5 12.5 C18.5 16 17 21 12 21 C7 21 5.5 16 6.5 12.5 Z"
      fill="${color}" stroke="#0b0b0d" stroke-width="0.8"/>
  </svg>`;
}
