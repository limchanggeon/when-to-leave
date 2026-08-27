/** 이동 수단. discrete 여부가 역산 로직을 가른다. */
export type LegKind = 'walk' | 'taxi' | 'subway' | 'bus' | 'train' | 'flight'

/** 시간표 신뢰도. 화면에서 반드시 구분해 표시한다 — 계획표를 실시간처럼 보여주면 안 된다. */
export type Confidence = 'live' | 'scheduled' | 'estimated'

export type Mode = 'arriveBy' | 'departNow'

export interface Place {
  name: string
  /** 역/터미널/공항 코드. 도보 구간의 양 끝은 없을 수 있다. */
  code?: string
  lat?: number
  lng?: number
}

export interface SeatInfo {
  /** null = 조회 불가(KTX 계획 시간표 등). false = 매진. */
  available: boolean | null
  className?: string
}

/**
 * 어댑터가 내놓는 구간 후보. 아직 시각이 확정되지 않은 상태다.
 * - 연속 구간(도보/택시): durationMin 만 쓴다.
 * - 이산 구간(열차/항공/지하철): departures 중 하나를 엔진이 고른다.
 */
export interface LegSpec {
  kind: LegKind
  from: Place
  to: Place
  /** 이산 구간이면 승차 후 소요시간, 연속 구간이면 이동시간. */
  durationMin: number
  /** 이산 구간의 출발 시각 목록. 오름차순 정렬 전제. */
  departures?: Departure[]
  confidence: Confidence
  /**
   * 이 구간에 적용할 여유(분). 어댑터가 직접 지정할 수 있다.
   * 인천공항처럼 혼잡도로 버퍼를 동적 계산하는 경우가 여기 해당한다.
   * 없으면 수단별 기본 정책값을 쓴다.
   */
  bufferMin?: number
  /** 어느 어댑터가 답했는지 — 디버깅과 신뢰도 표시에 쓴다. */
  source: string
  /**
   * 이 데이터가 실제 조회 결과인지. 화면에 그대로 노출된다.
   * 지금은 목업 어댑터가 없어 'live' 뿐이지만, 추정치나 캐시로 채운
   * 구간이 생기면 그때 구분해 표시하기 위한 자리다.
   */
  origin: 'mock' | 'live'
}

export interface Departure {
  at: Date
  carrier?: string
  seat?: SeatInfo
  /** 편별로 소요시간이 다르면 여기서 덮어쓴다. */
  durationMin?: number
  bookingUrl?: string
}

/** 시각이 확정된 구간. */
export interface Leg {
  kind: LegKind
  discrete: boolean
  from: Place
  to: Place
  departAt: Date
  arriveAt: Date
  /** 이 구간을 타기 위해 앞 구간이 지켜야 할 도착 시각. 이산 구간에만 있다. */
  deadline?: Date
  /** 적용된 여유(분). */
  bufferMin: number
  /** 이산 구간에서 앞 구간 도착 후 대기한 시간(분). 순방향 계산에서만 생긴다. */
  waitMin: number
  carrier?: string
  seat?: SeatInfo
  confidence: Confidence
  source: string
  origin: 'mock' | 'live'
  bookingUrl?: string
}

export interface Trip {
  id: string
  mode: Mode
  origin: Place
  destination: Place
  targetArrival: Date | null
  /** 엔진이 계산한 "나가야 할 시각". */
  departAt: Date
  arriveAt: Date
  legs: Leg[]
  /** 폴백 사다리가 만든 대안. 각각 도착 시각이 붙어 있다. */
  alternatives: Alternative[]
  /** 좌석 조회 불가·매진 등 사용자에게 알려야 할 사항. */
  warnings: Warning[]
}

export interface Alternative {
  /** 폴백 사다리 몇 번째 단인지. */
  rung: number
  label: string
  trip: Omit<Trip, 'alternatives'>
}

export type WarningCode =
  | 'seat-unknown'
  | 'seat-sold-out'
  | 'scheduled-only'
  | 'already-late'
  | 'no-solution'

export interface Warning {
  code: WarningCode
  /** i18n 템플릿에 넣을 값. 문구 자체는 여기 두지 않는다. */
  params?: Record<string, string | number>
}
