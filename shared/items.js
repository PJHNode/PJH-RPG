// client/src/items.js와 아이템 카탈로그를 동일하게 유지할 것.
// 서버는 이 파일로 효과(heal, stats)와 상점 가격(price)을 실제 적용하고,
// 클라이언트는 이름/아이콘/가격 표시에 쓴다. 판매가는 price의 절반(최소 1G).
//
// attackType: 무기(weapon)에만 있음. "melee"는 클릭 시 근접 스윙, "ranged"는 화살 발사.

const ITEMS = {
  wooden_sword: {
    id: "wooden_sword",
    name: "나무 검",
    type: "weapon",
    attackType: "melee",
    stackable: false,
    stats: { damage: 3 },
    color: 0xc9975b,
    price: 10,
  },
  iron_sword: {
    id: "iron_sword",
    name: "철검",
    type: "weapon",
    attackType: "melee",
    stackable: false,
    stats: { damage: 6 },
    color: 0xb5b8bd,
    price: 40,
  },
  short_bow: {
    id: "short_bow",
    name: "짧은 활",
    type: "weapon",
    attackType: "ranged",
    stackable: false,
    stats: { damage: 4 },
    color: 0x9c7a4a,
    price: 30,
  },
  leather_armor: {
    id: "leather_armor",
    name: "가죽 갑옷",
    type: "armor",
    stackable: false,
    stats: { defense: 2 },
    color: 0x8a5a3b,
    price: 25,
  },
  beetle_hammer: {
    id: "beetle_hammer",
    name: "장수풍뎅이 망치",
    type: "weapon",
    attackType: "melee",
    stackable: false,
    stats: { damage: 9 },
    color: 0x6b4a2a,
    price: 70,
  },
  long_bow: {
    id: "long_bow",
    name: "장궁",
    type: "weapon",
    attackType: "ranged",
    stackable: false,
    stats: { damage: 7 },
    color: 0x4a7a4a,
    price: 60,
  },
  beetle_shell_armor: {
    id: "beetle_shell_armor",
    name: "딱정벌레 갑옷",
    type: "armor",
    stackable: false,
    stats: { defense: 5 },
    color: 0x2e5c4a,
    price: 65,
  },
  health_potion: {
    id: "health_potion",
    name: "체력 물약",
    type: "consumable",
    stackable: true,
    maxStack: 20,
    effect: { heal: 20 },
    color: 0xff5577,
    price: 8,
  },
  haste_potion: {
    id: "haste_potion",
    name: "신속의 물약",
    type: "consumable",
    stackable: true,
    maxStack: 10,
    effect: { hasteMultiplier: 1.5, hasteDurationMs: 6000 },
    color: 0x7fe0ff,
    price: 15,
  },
};

const INVENTORY_SIZE = 12;

module.exports = { ITEMS, INVENTORY_SIZE };
