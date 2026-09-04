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
   * ODsay 는 **시각표를 주지 않는다.** 문서에는 startDateTime 이 있다고
   * 적혀 있지만 실제 응답에는 오지 않았고, 대신 이 두 값이 온다.
   * 그래서 구간은 연속 구간으로 두되, 배차 간격만큼 기다릴 수 있다는 사실은
   * 화면에 알린다. 진짜 시각표는 별도 소스가 붙어야 한다.
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
   * 이 구간의 선형을 어디서 받아올지.
   *
   * 좌표를 여기 미리 담지 않는다. 선형 조회(loadLane)는 ODsay 호출을
   * 하나 더 쓰는데, 경로를 3개씩 돌려주면 검색 한 번에 4번을 쓰게 되어
   * 일일 한도가 금방 마른다. 지도를 실제로 보는 경로만 /api/lane 으로
   * 따로 받는다.
   *
   * index 는 이 경로의 대중교통 구간 중 몇 번째인가 — lane[index] 가 짝이다.
   * 도보 구간에는 없다(ODsay 가 도보 선형을 주지 않는다).
   */
  shapeRef?: { mapObj: string; index: number }
  /**
   * 이 구간이 실제로 지나는 길. 카카오는 경로 응답에 함께 준다.
   * 없으면 지도가 양 끝을 점선으로 잇는다 — 실제 경로가 아님을 알리려고.
   */
  shape?: LatLng[]
  /**
   * 어느 TAGO 시각표에 물어봐야 하는가.
   *
   * ODsay 의 trafficType 은 고속버스(5)와 시외버스(6)를 구분하는데
   * kind 로 옮기면 둘 다 'bus' 가 되어 사라진다. 시각표 서비스가
   * 서로 다르고 터미널 코드 체계까지 달라서(NAEK… vs NAI…) 여기 남긴다.
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

