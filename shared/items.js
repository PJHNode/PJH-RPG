// client/src/items.js와 아이템 카탈로그를 동일하게 유지할 것.
// 서버는 이 파일로 효과(heal, stats)를 실제 적용하고, 클라이언트는 이름/아이콘 표시에 쓴다.

const ITEMS = {
  wooden_sword: {
    id: "wooden_sword",
    name: "나무 검",
    type: "weapon",
    stackable: false,
    stats: { damage: 3 },
    color: 0xc9975b,
  },
  iron_sword: {
    id: "iron_sword",
    name: "철검",
    type: "weapon",
    stackable: false,
    stats: { damage: 6 },
    color: 0xb5b8bd,
  },
  leather_armor: {
    id: "leather_armor",
    name: "가죽 갑옷",
    type: "armor",
    stackable: false,
    stats: { defense: 2 },
    color: 0x8a5a3b,
  },
  health_potion: {
    id: "health_potion",
    name: "체력 물약",
    type: "consumable",
    stackable: true,
    maxStack: 20,
    effect: { heal: 20 },
    color: 0xff5577,
  },
};

const INVENTORY_SIZE = 12;

module.exports = { ITEMS, INVENTORY_SIZE };
