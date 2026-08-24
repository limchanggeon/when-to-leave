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

## 지금 상태 (M0)

- 역산 엔진(`solveBackward`/`solveForward`) 동작, 단위 테스트로 고정
- 국내 목업 어댑터 1개 (서울↔부산 시나리오만 앎 — 모르는 목적지는 정직하게 실패)
- 정규식 파서
- 캘린더 연동·폴백 사다리 UI·실제 k-skill 어댑터는 아직 없음(M1)
