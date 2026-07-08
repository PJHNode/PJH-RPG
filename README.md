# PJH-RPG

Realm of the Mad God 스타일의 웹 브라우저 2D 도트 MMORPG.
탑다운 뷰, 실시간 멀티플레이, 마우스 클릭 투사체 슈팅, 레벨/인벤토리/아이템 시스템.

## 기술 스택

- **클라이언트**: [Phaser 3](https://phaser.io/) (CDN 로드, 번들러 없음, 순수 ES Module)
- **서버**: Node.js + Express + [Socket.io](https://socket.io/)
- **저장**: 브라우저 `localStorage` (계정/로그인 없음, 기기별로 캐릭터 저장)

## 실행 방법

```
npm install
npm run dev
```

`http://localhost:3000` 을 여러 브라우저 창(또는 탭)으로 열면 서로 다른 플레이어로 접속되어
실시간으로 위치가 동기화됩니다.

## 프로젝트 구조

```
PJH-RPG/
├── server/
│   └── index.js          # 정적 서빙 + Socket.io + 맵/아이템/레벨/인벤토리 authoritative 상태
├── client/
│   ├── index.html         # Phaser/Socket.io CDN 로드 + HUD/인벤토리 DOM
│   └── src/
│       ├── main.js        # Phaser 게임 설정
│       ├── config.js      # 클라이언트 상수 (shared/constants.js와 값 동기화 필요)
│       ├── items.js       # 아이템 카탈로그 (shared/items.js와 동기화 필요)
│       ├── leveling.js    # XP 계산 표시용 (shared/leveling.js와 동기화 필요)
│       ├── storage.js     # localStorage 캐릭터 저장/불러오기
│       ├── network.js     # Socket.io 클라이언트 래퍼
│       ├── ui.js          # HUD / 인벤토리 바 DOM 렌더링
│       └── scenes/
│           └── GameScene.js  # 타일맵, 이동, 카메라, 투사체, 아이템 픽업, 멀티플레이 동기화
├── shared/
│   ├── constants.js       # 서버가 require하는 공용 상수 (타일 크기, 속도 등)
│   ├── items.js           # 아이템 카탈로그 (서버 authoritative)
│   ├── leveling.js        # XP 공식 + 레벨업 적용 로직 (서버 authoritative)
│   └── islandMap.js       # 시작의 섬 지형 생성기 (서버 전용, 클라이언트는 결과 배열만 받음)
└── package.json
```

## 유저 데이터 구조

캐릭터는 계정 시스템 없이 브라우저 `localStorage`(키: `pjh-rpg-character`)에 저장되고,
접속 시 서버로 전송되어 서버 쪽 `players[socket.id]`에 병합됩니다.

```js
{
  playerId: "uuid",          // 클라이언트가 최초 생성, 기기 내에서 캐릭터 식별용
  level: 1,                  // 1~10 (시작의 섬 레벨 캡)
  xp: 0,                     // 다음 레벨까지 누적 경험치 (레벨업 시 초과분만 이월)
  hp: 20,
  maxHp: 20,                 // 레벨에 따라 자동 계산 (shared/leveling.js maxHpForLevel)
  gold: 0,
  inventory: [               // 고정 12슬롯, 빈 슬롯은 null
    { itemId: "health_potion", qty: 3 },
    null, null, /* ... */
  ],
  equipped: { weapon: "wooden_sword", armor: null },
}
```

서버 쪽 플레이어 상태는 여기에 `x, y, rotation, color`(위치/외형, 저장 대상 아님)가 추가된 형태입니다.

## 맵 설계 — 시작의 섬 (레벨 1~10)

- `shared/islandMap.js`가 50×50 타일(1600×1600px) 섬을 절차적으로 생성합니다.
  섬 중심에서의 거리로 지형을 결정: 내륙은 잔디/흙(의사난수로 흙 patch 흩뿌림), 해안 3타일은 모래,
  섬 반지름 밖은 전부 바다.
- 서버가 한 번만 생성해서 클라이언트에 그대로 전송 — 생성 로직은 서버에만 있고, 클라이언트는 받은
  배열을 렌더링/충돌 판정에만 사용합니다.
- **바다 진입 제한**: `LEVEL_REQUIRED_FOR_SEA = 10` 기준으로
  - 레벨 10 미만: 바다 타일에 Arcade Physics 충돌이 걸려 물리적으로 진입 불가
  - 레벨 10 이상: 진입은 가능하지만 이동 속도가 `WATER_SPEED_MULTIPLIER(0.5)`로 감소 (배 없이 헤엄치는 느낌)
  - 이 판정은 레벨이 바뀔 때마다(`applyWaterCollision`) 다시 계산됩니다.
- 타일 그래픽은 아직 실제 도트 스프라이트가 아니라 색상 사각형 placeholder입니다
  (잔디=초록, 흙=갈색, 모래=베이지, 바다=파랑).

## 레벨 / 아이템 / 인벤토리 시스템

- XP 곡선과 레벨업 처리(`applyXp`)는 서버(`shared/leveling.js`)가 authoritative하게 수행합니다.
  레벨업 시 최대 HP가 늘고 풀피로 회복됩니다.
- 아이템 카탈로그(`shared/items.js`): 무기(나무 검/철검), 방어구(가죽 갑옷), 소비 아이템(체력 물약, 스택 가능).
- 인벤토리는 고정 12슬롯. 월드에 흩뿌려진 아이템(무기/방어구/물약)과 XP 조각을 걸어서 밟으면
  자동 습득되고, 다른 접속자 화면에서도 즉시 사라집니다(서버가 단일 진실 소스).
- 습득한 자리는 8초 후 같은 종류로 리스폰되어 테스트/파밍이 마르지 않게 했습니다.
- 인벤토리 슬롯 클릭: 소비 아이템(물약)은 사용(회복), 무기/방어구는 장착(기존 장착 아이템은
  인벤토리로 돌아옴).
- 새 캐릭터는 나무 검 장착 + 체력 물약 3개로 시작합니다.

## 실시간 이동 / 투사체

- WASD / 방향키로 자유 이동 (그리드 없는 탑다운), 카메라가 플레이어를 따라감
- 마우스 커서 방향으로 캐릭터가 회전 (이동 방향과 별개로 조준 가능)
- 마우스 클릭 시 클릭 지점 방향으로 실시간 투사체 발사
- Socket.io로 접속/이동/발사/연결 해제를 모든 클라이언트에 실시간 브로드캐스트
  - 위치 동기화는 클라이언트가 주기적으로(50ms) 전송 → 다른 클라이언트는 보간(lerp)해서 부드럽게 표시
  - 투사체는 서버가 발생 이벤트만 브로드캐스트하고, 각 클라이언트가 로컬에서 직선 이동을 시뮬레이션

## 알려진 한계 / 다음 단계 (예정)

- 투사체가 아직 아무것도 맞히지 않음 — 플레이어/몬스터 충돌 판정 없음
- 몬스터 스폰 / AI 없음 (지금은 XP 조각을 주워서만 레벨업 가능)
- 이동/좌표는 여전히 클라이언트를 대부분 신뢰 (물 진입 제한도 클라이언트 판정이라 우회 가능함)
- 실제 도트 스프라이트/타일셋 이미지 없음 (색상 도형 placeholder)
- 배(보트) 아이템처럼 "레벨 10 이상에서 정상 속도로 항해" 하는 수단 없음 — 지금은 그냥 감속만 적용
- 로그인/계정 없음 — 같은 브라우저가 아니면 캐릭터가 이어지지 않음
