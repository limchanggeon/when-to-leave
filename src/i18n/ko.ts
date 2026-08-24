/**
 * 결과 설명은 템플릿이다 — LLM에게 생성시키지 않는다(설계 문서 "AI·추론" 참조).
 * 언어별로 이 파일 한 벌씩 늘어난다. 문구를 컴포넌트에 직접 박지 않는 이유.
 */
export const ko = {
  app: {
    title: '언제 나가야 하나',
    tagline: '목적지를 말하면, 몇 시에 나가야 하는지 계산합니다',
  },
  search: {
    placeholder: '예: 수서에서 동대구 11시까지',
    submit: '계산하기',
    modeArriveBy: '도착 시각 맞추기',
    modeDepartNow: '지금 출발하면?',
  },
  result: {
    departAt: (t: string) => `${t}에 나가세요`,
    arriveAt: (t: string) => `${t} 도착 예정`,
    leaveIn: (m: string) => `${m} 후 출발`,
    alreadyLate: '이미 늦었어요 — 다음 편으로 다시 계산했어요',
    buffer: (m: number) => `여유 ${m}분 포함`,
  },
  leg: {
    walk: '도보',
    taxi: '택시',
    subway: '지하철',
    bus: '버스',
    train: '열차',
    flight: '항공',
    wait: (m: number) => `대기 ${m}분`,
  },
  confidence: {
    live: '실시간',
    scheduled: '계획 시간표',
    estimated: '추정',
  },
  warning: {
    'seat-unknown': '이 편은 좌석 조회가 되지 않습니다',
    'seat-sold-out': '매진 — 다음 대안을 확인하세요',
    'scheduled-only': '계획 시간표 기준입니다. 실제와 다를 수 있어요',
    'already-late': '목표 시각까지 남은 시간이 없습니다',
    'no-solution': '이 조건에 맞는 경로를 찾지 못했습니다',
  },
  fallback: {
    label: '표가 없다면',
    'fallback.station': '다른 역에서 타기',
    'fallback.bus': '고속버스로 바꾸기',
  },
  dataGap: {
    title: '데이터를 가져오지 못했습니다',
    'not-implemented': (adapter: string) => `${adapter} 어댑터가 아직 연결되지 않았습니다`,
    'no-credentials': (adapter: string) => `${adapter} API 키가 설정되지 않았습니다`,
    'no-data': (adapter: string) => `${adapter}에서 결과가 비어 왔습니다`,
    network: (adapter: string) => `${adapter}에 연결하지 못했습니다`,
    'upstream-error': (adapter: string) => `${adapter}가 오류를 반환했습니다`,
    retry: '다시 시도',
  },
  mockBanner: '지금 보는 시간표는 목업 데이터입니다. 실제 값이 아닙니다.',
}

export type I18nShape = typeof ko
