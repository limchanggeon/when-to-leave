# 언제 나가야 하나

대화로 목적지를 말하면 도착 시각을 예측하고, 목표 도착 시각에서 출발 시각을 역산해 알람을 걸어주는 이동 비서.
설계 배경은 [docs/PLATFORM.md](docs/PLATFORM.md)와 `docs/*.docx` 참조.

## 실행

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # 엔진 단위 테스트
pnpm build     # 타입체크 + 번들
```

## 구조

```
src/
  engine/     ← 역산 엔진. React·DOM 모름. 앱(RN)에서도 그대로 재사용.
    types.ts     타입 계약 (LegSpec/Leg/Trip/Warning)
    time.ts      Date 유틸
    buffer.ts    수단별 여유 정책 (상수 테이블)
    schedule.ts  solveBackward / solveForward — 핵심 로직
  adapters/   ← 데이터 소스. 목업/실제를 같은 인터페이스로 교체한다.
    types.ts     RouteAdapter 계약, Failure(실패는 값이지 예외가 아니다)
    registry.ts  어댑터 등록 + 라우팅. hasMockAdapters() 로 목업 여부 노출
    mock/        M0용 목업. 폴더째 지우면 깨끗이 사라진다 — 아래 참조
  parse/      ← 발화 파싱. 지금은 정규식, 나중에 Qwen3 0.6B로 교체(계약 동일).
  i18n/       ← 언어별 문구 사전. 결과 설명은 템플릿이지 LLM 생성이 아니다.
  ui/         ← React 컴포넌트. 플랫폼 종속 코드는 전부 여기.
```

## 목업 데이터 제거 방법

1. `src/adapters/registry.ts` 상단의 `import { mockKoreaAdapter } ...` 줄과
   `adapters` 배열의 `mockKoreaAdapter` 항목을 지운다.
2. `src/adapters/mock/` 폴더를 통째로 지운다.

그 뒤로는 실제 어댑터가 없는 구간이 자동으로 `not-implemented` 실패를 내고,
화면에는 `<DataGap>` 배너가 떠서 **데이터가 안 들어왔다는 사실 자체가 표시된다**
— 조용히 빈 화면이 되는 경우는 없다. 실제 어댑터를 붙일 때도 같은 계약이라
(`ok`/`failure` 유니언), 네트워크가 끊기거나 API 키가 없으면 똑같이
`<DataGap>`이 뜬다.

## 외부 서비스 키 (지도 · 로그인)

`.env.example` 를 `.env` 로 복사하고 값을 채운 뒤 서버를 재시작하세요.
키가 없어도 앱은 정상 동작하며, 화면에 무엇이 빠졌는지 표시됩니다.

| 항목 | 환경변수 | 발급처 |
|---|---|---|
| 카카오 지도 + 카카오 로그인 | `VITE_KAKAO_JS_KEY` | [Kakao Developers](https://developers.kakao.com/console/app) — JavaScript 키 |
| 구글 지도 (해외 구간) | `VITE_GOOGLE_MAPS_KEY` | [Google Maps Platform](https://console.cloud.google.com/google/maps-apis) |
| 구글 로그인 | `VITE_GOOGLE_CLIENT_ID` | [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) — OAuth 웹 클라이언트 |

### 콘솔에 등록할 주소

포트는 `vite.config.ts` 에 고정돼 있습니다 — dev `5173`, preview `4173`.

**카카오** ([developers.kakao.com](https://developers.kakao.com/console/app) > 내 애플리케이션)

| 위치 | 넣을 값 |
|---|---|
| 앱 설정 > 플랫폼 > Web > 사이트 도메인 | `http://localhost:5173` 과 `http://localhost:4173` (경로 없이 오리진만) |
| 제품 설정 > 카카오 로그인 > 활성화 | ON |
| 제품 설정 > 카카오 로그인 > Redirect URI | `http://localhost:5173/auth/kakao/callback`<br>`http://localhost:4173/auth/kakao/callback` |
| 제품 설정 > 카카오 로그인 > 동의항목 | 닉네임 · 프로필 사진 (필수 동의) |
| 제품 설정 > **카카오맵** > 활성화 설정 | **ON** (지도를 쓰려면 반드시 켜야 함) |

> 카카오맵 활성화를 안 켜면 SDK 요청이 403 으로 막히고 브라우저에는
> `ERR_BLOCKED_BY_ORB` 로만 보여 원인을 알기 어렵습니다.
> 응답 본문에는 `disabled OPEN_MAP_AND_LOCAL service` 가 들어 있습니다.
> (2024-12-01 부터 신규 앱은 기본 비활성 상태입니다.)

**구글** ([Cloud Console](https://console.cloud.google.com/apis/credentials) > OAuth 클라이언트 ID > 웹 애플리케이션)

| 위치 | 넣을 값 |
|---|---|
| 승인된 JavaScript 원본 | `http://localhost:5173`, `http://localhost:4173` |
| 승인된 리디렉션 URI | **불필요** — GIS 는 리다이렉트 없이 동작합니다 |

배포 후에는 위 `http://localhost:PORT` 자리에 실제 도메인(`https://...`)을 같은 형태로 추가하면 됩니다.
카카오 Redirect URI 는 `VITE_KAKAO_REDIRECT_URI` 를 비워두면 접속한 오리진에서 자동으로 만들어지므로,
콘솔에 도메인별로 등록만 해두면 코드는 건드릴 필요가 없습니다.

### 로그인 페이지

`/login` 에 별도 페이지가 있습니다 (`src/ui/pages/LoginPage.tsx`).

- **카카오**: 공식 디자인 가이드 규격으로 구현 — 배경 `#FEE500`, 텍스트 `#000000` 85% 투명도,
  모서리 반경 12px, 문구 "카카오 로그인", 심볼 필수.
  ⚠ 말풍선 심볼은 규격에 맞춰 그린 SVG입니다. 가이드가 심볼의 형태·비율 변경을 금지하므로
  **배포 전 카카오가 제공하는 공식 PNG 에셋으로 교체**하세요
  (`src/ui/components/KakaoLoginButton.tsx` 의 `<svg>` 부분만 바꾸면 됩니다).
- **구글**: Google Identity Services 의 `renderButton` 으로 구글이 직접 버튼을 그립니다 —
  브랜딩 규격이 자동으로 지켜집니다. 키가 없으면 대체 버튼이 표시됩니다.

> 참고: 구글의 구버전 "Google 로그인" 라이브러리(`gapi.auth2`, `signin2.render`) 문서는
> 상단에 **지원 중단** 경고가 붙어 있습니다. 이 프로젝트는 현행 방식인
> Google Identity Services 를 씁니다.

### 아직 서버가 없어서 생기는 한계

현재 로그인은 **클라이언트 전용**입니다. 구글 ID 토큰을 화면 표시용으로만 디코딩하고
서명을 검증하지 않으며, 계정 정보는 localStorage 에 있습니다. 사용자가 고칠 수 있는
값이므로 **권한 판단에 쓰면 안 됩니다.** 실서비스로 가려면 토큰 검증과 세션을
서버가 맡아야 합니다.

카카오 공식 문서 기준 정석 흐름은 **인가 코드 → 서버에서 토큰 교환**(client_secret 필요)입니다.
지금은 서버가 없어 JS SDK 의 클라이언트 로그인을 쓰고 있으며, 서버가 생기면
`src/auth/kakao.ts` 의 `signIn()` 만 인가 코드 방식으로 바꾸면 됩니다.

## 지금 상태 (M0)

- 역산 엔진(`solveBackward`/`solveForward`) 동작, 단위 테스트로 고정
- 국내 목업 어댑터 1개 (서울↔부산 시나리오만 앎 — 모르는 목적지는 정직하게 실패)
- 정규식 파서
- 폴백 사다리 UI 연결됨 (대안 클릭 시 여정 교체)
- 로그인(카카오/구글)·지도(카카오/구글) 구조 완성 — 키만 넣으면 동작
- 캘린더 연동·실제 k-skill 어댑터·서버 세션은 아직 없음(M1)
