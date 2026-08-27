import type { Leg, Mode } from './types'

export type SeatState = 'ok' | 'unknown' | 'sold-out'

/**
 * 여정 전체의 좌석 상태.
 * null(조회 불가)과 false(매진)는 다르다 — KTX 는 계획 시간표뿐이라
 * 늘 null 인데, 이걸 매진과 같이 취급하면 KTX 가 영영 안 뽑힌다.
 */
export function seatStateOf(legs: Leg[]): SeatState {
  let sawUnknown = false
  for (const leg of legs) {
    if (!leg.discrete || !leg.seat) continue
    if (leg.seat.available === false) return 'sold-out'
    if (leg.seat.available === null) sawUnknown = true
  }
  return sawUnknown ? 'unknown' : 'ok'
}

export interface Rankable {
  legs: Leg[]
  departAt: Date
  arriveAt: Date
}

/** 왜 이 경로가 뽑혔는지. 화면에 그대로 보여준다. */
export type ChosenReason = 'latest-departure' | 'earliest-arrival'

export const reasonFor = (mode: Mode): ChosenReason =>
  mode === 'arriveBy' ? 'latest-departure' : 'earliest-arrival'

const isSoldOut = (r: Rankable) => seatStateOf(r.legs) === 'sold-out'
const SEAT_TIEBREAK: Record<SeatState, number> = { ok: 0, unknown: 1, 'sold-out': 2 }

/**
 * 경로 비교. 낮을수록 먼저 온다.
 *
 * 1. 매진은 뒤로 — 못 타는 편은 아무리 빨라도 소용없다.
 * 2. 목표 도착 모드면 **늦게 나가도 되는 쪽**이 낫다. 같은 시각에 도착한다면
 *    한 시간 더 자도 되는 경로가 이긴다.
 *    지금 출발 모드면 **빨리 도착하는 쪽**이 낫다.
 * 3. 그래도 같으면 좌석이 확인된 쪽.
 */
export function compareRoutes(a: Rankable, b: Rankable, mode: Mode): number {
  const soldA = isSoldOut(a)
  const soldB = isSoldOut(b)
  if (soldA !== soldB) return soldA ? 1 : -1

  if (mode === 'arriveBy') {
    const byDeparture = b.departAt.getTime() - a.departAt.getTime()
    if (byDeparture !== 0) return byDeparture
    const byArrival = a.arriveAt.getTime() - b.arriveAt.getTime()
    if (byArrival !== 0) return byArrival
  } else {
    const byArrival = a.arriveAt.getTime() - b.arriveAt.getTime()
    if (byArrival !== 0) return byArrival
    const byDeparture = b.departAt.getTime() - a.departAt.getTime()
    if (byDeparture !== 0) return byDeparture
  }

  return SEAT_TIEBREAK[seatStateOf(a.legs)] - SEAT_TIEBREAK[seatStateOf(b.legs)]
}

/** 경로를 사람이 알아볼 이름으로. 이름표를 따로 두지 않고 데이터에서 뽑는다. */
export function describeRoute(legs: Leg[]): { carrier: string | null; origin: string | null } {
  const main = legs.find((l) => l.discrete && l.kind !== 'subway') ?? legs.find((l) => l.discrete)
  return { carrier: main?.carrier ?? null, origin: main?.from.name ?? null }
}
