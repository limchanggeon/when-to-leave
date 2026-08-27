import type { Leg, Mode } from './types'

export type SeatState = 'ok' | 'unknown' | 'sold-out'

/**
 * 여정 전체의 좌석 상태.
 *
 * null(조회 불가)과 false(매진)는 다르다 — 계획 시간표만 있는 편은 늘 null 인데,
 * 이걸 매진과 같이 취급하면 그 편이 영영 안 뽑힌다.
 *
 * 좌석 정보가 **아예 없으면 'ok' 가 아니라 'unknown'** 이다.
 * ODsay 처럼 좌석을 주지 않는 소스에서 'ok' 를 내면
 * 화면에 "좌석 있음"이라는 근거 없는 말이 뜬다.
 */
export function seatStateOf(legs: Leg[]): SeatState {
  let sawSeatInfo = false
  let sawUnknown = false
  for (const leg of legs) {
    if (!leg.seat) continue
    sawSeatInfo = true
    if (leg.seat.available === false) return 'sold-out'
    if (leg.seat.available === null) sawUnknown = true
  }
  if (!sawSeatInfo) return 'unknown'
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

/**
 * 경로를 사람이 알아볼 이름으로. 이름표를 따로 두지 않고 데이터에서 뽑는다.
 *
 * 이산 구간만 보면 안 된다 — 시각표 없이 소요시간만 주는 소스(ODsay)에서는
 * 모든 구간이 연속 구간이라 이름이 하나도 안 잡힌다.
 * 가장 오래 타는 비(非)도보 구간을 대표로 쓴다.
 */
export function describeRoute(legs: Leg[]): { carrier: string | null; origin: string | null } {
  const rides = legs.filter((l) => l.kind !== 'walk')
  const main = rides.reduce<Leg | null>(
    (best, leg) =>
      !best || leg.arriveAt.getTime() - leg.departAt.getTime() >
      best.arriveAt.getTime() - best.departAt.getTime()
        ? leg
        : best,
    null,
  )
  return { carrier: main?.carrier ?? null, origin: main?.from.name ?? null }
}
