/**
 * 경로 응답의 공용 모양.
 *
 * 어느 제공자를 쓰든 클라이언트가 보는 형태는 같아야 한다 —
 * 지금은 카카오(시내)와 TAGO 조합(시외)이 이걸 채운다.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** 클라이언트로 넘길 구간. JSON 으로 안전한 값만 담는다(시각은 ISO 문자열). */
export interface WireLeg {
  kind: 'walk' | 'subway' | 'bus' | 'train' | 'flight'
  from: { name: string; lat?: number; lng?: number }
  to: { name: string; lat?: number; lng?: number }
  durationMin: number
  carrier?: string
  confidence: 'live' | 'scheduled' | 'estimated'
  /**
   * 평균 배차 간격(분)과 하루 운행 편수.
   *
   * 카카오도 시각표를 주지 않고 평시 소요시간만 준다. 실제 출발 시각은
   * TAGO 에서 받아 runs 로 붙인다 — 그게 있어야 역산이 제 몫을 한다.
   */
  frequencyMin?: number
  runsPerDay?: number
  fare?: number
  /** 특실 운영 여부(기차). */
  premiumSeat?: boolean
  /**
   * 실제 운행 시각. 열차 구간에만 붙는다(TAGO).
   * 이게 있으면 엔진이 그 구간을 이산 구간으로 보고 데드라인을 전파한다 —
   * 이 앱의 알맹이가 여기서 살아난다.
   */
  runs?: { departAt: string; arriveAt: string; carrier: string; fare?: number }[]
  /**
   * 이 구간이 실제로 지나는 길. 카카오는 경로 응답에 함께 준다.
   * 없으면 지도가 양 끝을 점선으로 잇는다 — 실제 경로가 아님을 알리려고.
   *
   * **접어서 보낸다**(인코딩 폴리라인, `server/polyline.ts`). 좌표 객체로
   * 보내던 시절 이 값이 응답의 86% 를 차지했다 — 점 하나에 43바이트였다.
   * 클라이언트는 `src/map/polyline.ts` 로 편다.
   */
  shape?: string
  /**
   * 어느 TAGO 시각표에 물어봐야 하는가.
   *
   * kind 만으로는 고속버스와 시외버스가 둘 다 'bus' 가 되어 구분이 사라진다.
   * 시각표 서비스가 서로 다르고 터미널 코드 체계까지 달라서(NAEK… vs NAI…)
   * 어느 쪽인지 여기 남긴다.
   */
  tagoKind?: 'train' | 'expressBus' | 'suburbsBus' | 'subway' | 'flight'
}

export interface WireRoute {
  legs: WireLeg[]
  totalMin: number
}

export type RouteResult =
  | { ok: true; routes: WireRoute[] }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'network' | 'upstream-error'; message: string }

