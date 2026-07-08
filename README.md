# PJH-RPG

Realm of the Mad God 스타일의 웹 브라우저 2D 도트 MMORPG.
탑다운 뷰, 실시간 멀티플레이, 마우스 클릭 투사체 슈팅.

## 기술 스택

- **클라이언트**: [Phaser 3](https://phaser.io/) (CDN 로드, 번들러 없음, 순수 ES Module)
- **서버**: Node.js + Express + [Socket.io](https://socket.io/)

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
│   └── index.js          # Express 정적 서빙 + Socket.io 이벤트 처리
├── client/
│   ├── index.html         # Phaser/Socket.io CDN 로드 + 진입점
│   └── src/
│       ├── main.js        # Phaser 게임 설정
│       ├── config.js      # 클라이언트 상수 (서버 shared/constants.js와 값 동기화 필요)
│       ├── network.js     # Socket.io 클라이언트 래퍼
│       └── scenes/
│           └── GameScene.js  # 이동, 카메라, 투사체, 멀티플레이 동기화
├── shared/
│   └── constants.js       # 서버가 require하는 공용 상수
└── package.json
```

## 현재 구현

- WASD / 방향키로 자유 이동 (그리드 없는 탑다운), 카메라가 플레이어를 따라감
- 마우스 커서 방향으로 캐릭터가 회전 (이동 방향과 별개로 조준 가능)
- 마우스 클릭 시 클릭 지점 방향으로 실시간 투사체 발사
- Socket.io로 접속/이동/발사/연결 해제를 모든 클라이언트에 실시간 브로드캐스트
  - 위치 동기화는 클라이언트가 주기적으로(50ms) 전송 → 다른 클라이언트는 보간(lerp)해서 부드럽게 표시
  - 투사체는 서버가 발생 이벤트만 브로드캐스트하고, 각 클라이언트가 로컬에서 직선 이동을 시뮬레이션

## 다음 단계 (예정)

- 투사체 충돌 판정 (플레이어 HP, 몬스터)
- 몬스터 스폰 / AI
- 인벤토리 / 아이템 / 클래스(직업)
- 맵 타일셋 및 도트 스프라이트 (현재는 원형 placeholder)
- 서버 권위(authoritative) 검증 강화 (현재는 클라이언트가 보낸 좌표를 대부분 신뢰)
