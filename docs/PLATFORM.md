# 플랫폼 전략

웹 먼저, 이후 Android·iOS 앱. 나중에 다시 짜지 않으려고 지금부터 레이어를 가른다.

## 규칙

`src/engine`, `src/adapters`, `src/parse`, `src/i18n` 은 **React도 DOM도 모른다.**
`Date`, `fetch`, 순수 함수만 쓴다. `window`, `document`, `localStorage`를 직접 참조하지 않는다 —
저장이 필요하면 이 레이어는 인터페이스만 받고, 구현은 `src/ui`(웹) 또는 앱 쉘(RN)이 주입한다.

이 규칙이 지켜지면 위 네 폴더는 웹 빌드와 React Native 빌드 양쪽에서 **그대로** 재사용된다.
다시 짜야 하는 건 `src/ui` 뿐이다 — 화면은 어차피 플랫폼마다 다르게 그려야 한다.

## 지금 결정: 웹은 React + Vite

앱 전환 시점에 고른다. 후보 두 갈래:

| 경로 | 장점 | 비용 |
|---|---|---|
| **Capacitor** (웹뷰 래핑) | 지금 UI를 거의 그대로 씀. 캘린더·푸시는 네이티브 플러그인으로 보강 | 진짜 네이티브 느낌은 약함 |
| **React Native (+ RN Web)** | 진짜 네이티브 UI, 성능 | `src/ui`를 다시 그려야 함(엔진은 재사용) |

지금 당장 정할 필요는 없다 — 위 규칙만 지키면 어느 쪽을 골라도 손실이 `src/ui` 하나로 한정된다.
CSS는 지금은 일반 CSS를 쓰되, 나중에 RN을 고르면 style 객체로 옮기기 쉽도록
**flex 기반 레이아웃, 색상은 토큰 변수 참조**로 짠다 (grid는 RN 미지원이라 최소화).

## 지금 걸어두는 제약

- 로컬 저장은 `src/ui/storage.ts` 의 인터페이스 뒤에 둔다(웹은 localStorage, 앱은 나중에 SecureStore 등으로 교체).
- 날짜는 항상 `Date` 객체로 다루고 포맷은 `src/engine/time.ts` 에서만 한다 — 플랫폼별 로케일 API에 흩뿌리지 않는다.
