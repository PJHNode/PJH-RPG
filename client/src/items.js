// shared/items.js와 카탈로그를 동일하게 유지할 것.

export const ITEMS = {
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
};

export const INVENTORY_SIZE = 12;
