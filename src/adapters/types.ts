import type { LegSpec, Place } from '../engine/types'

/**
 * 어댑터 실패는 예외가 아니라 값이다.
 * 화면에 그대로 렌더되어야 하므로 코드와 맥락을 남긴다.
 * 조용히 빈 배열을 돌려주는 일은 절대 없어야 한다 —
 * "데이터가 없다"와 "데이터를 못 가져왔다"는 사용자에게 다른 뜻이다.
 */
export type FailureCode =
  /** 이 구간을 담당할 어댑터가 아직 구현되지 않았다. */
  | 'not-implemented'
  /** API 키·토큰이 없다. */
  | 'no-credentials'
  /** 정상 호출했으나 결과가 비었다. */
  | 'no-data'
  /** 네트워크 실패. */
  | 'network'
  /** 상대 서버가 에러를 냈다. */
  | 'upstream-error'

export interface Failure {
  code: FailureCode
  /** 어느 어댑터에서 났는지. 화면에 그대로 노출한다. */
  adapter: string
  /** 사람이 읽을 부가 정보. i18n 대상이 아닌 기술 문자열. */
  detail?: string
}

export type AdapterResult<T> = { ok: true; data: T } | { ok: false; failure: Failure }

export const fail = (code: FailureCode, adapter: string, detail?: string): AdapterResult<never> => ({
  ok: false,
  failure: { code, adapter, detail },
})

export interface RouteRequest {
  from: Place
  to: Place
  /** 이 시각 근처의 시간표를 달라는 힌트. 어댑터가 창을 정한다. */
  around: Date
  /** 출발지·도착지 국가. 라우팅과 어댑터 선택에 쓴다. */
  fromCountry: CountryCode
  toCountry: CountryCode
}

export type CountryCode = 'KR' | 'JP' | 'OTHER'

export interface RouteAdapter {
  /** 화면에 노출되는 식별자. */
  id: string
  /** 목업인지 실제인지. 화면 배지와 경고 배너가 이 값을 본다. */
  origin: 'mock' | 'live'
  /** 이 요청을 처리할 수 있는지. */
  supports(req: RouteRequest): boolean
  /** 구간 후보를 낸다. 실패하면 Failure 를 담아 돌려준다. */
  route(req: RouteRequest): Promise<AdapterResult<LegSpec[]>>
  /**
   * 폴백 사다리용 대안 경로. 출발역 교체·수단 교체처럼
   * 앞 구간까지 통째로 달라지는 경우를 어댑터가 직접 만든다.
   * 구현하지 않아도 된다 — 그러면 사다리 1단(다른 시간대)만 동작한다.
   */
  alternatives?(req: RouteRequest): Promise<AdapterResult<LabeledRoute[]>>
}

/** 폴백 사다리의 한 단. rung 은 설계 문서의 단 번호와 맞춘다. */
export interface LabeledRoute {
  rung: number
  /** i18n 키. 문구 자체는 여기 두지 않는다. */
  labelKey: string
  specs: LegSpec[]
}
