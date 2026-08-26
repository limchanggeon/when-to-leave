import { addMin, diffMin } from './time'
import { resolveBuffer, type BufferPolicy } from './buffer'
import type { Leg, LegSpec } from './types'

export type SolveFailure = {
  /**
   * no-departure: 창 안에 탈 수 있는 편이 아예 없다.
   * too-late: 편은 있지만 전부 이미 지나갔다 — 목표 시각을 재협상해야 한다.
   */
  reason: 'no-departure' | 'too-late'
  /** 몇 번째 구간에서 막혔는지 — 폴백 사다리가 이 구간을 노려 대안을 만든다. */
  atIndex: number
}

export type SolveResult = { ok: true; legs: Leg[] } | { ok: false; failure: SolveFailure }

const isDiscrete = (s: LegSpec) => Boolean(s.departures && s.departures.length > 0)

function baseLeg(s: LegSpec, departAt: Date, arriveAt: Date, bufferMin: number): Leg {
  return {
    kind: s.kind,
    discrete: isDiscrete(s),
    from: s.from,
    to: s.to,
    departAt,
    arriveAt,
    bufferMin,
    waitMin: 0,
    confidence: s.confidence,
    source: s.source,
    origin: s.origin,
  }
}

/**
 * 목표 도착 시각에서 거꾸로 푼다.
 *
 * 연속 구간은 소요시간을 그대로 뺀다. 이산 구간은 다르다 — 정해진 시각에만
 * 출발하므로, "제 시간에 도착하는 편 중 가장 늦게 떠나는 것"을 고르고,
 * 그 출발 시각에서 여유를 뺀 값을 **앞 구간이 지켜야 할 데드라인**으로 넘긴다.
 * 이 전파가 이 엔진의 전부다.
 */
export function solveBackward(
  specs: LegSpec[],
  targetArrival: Date,
  policy: BufferPolicy,
  /**
   * 이 시각보다 이르게 출발하는 편은 고르지 않는다. 보통 "지금".
   * 없으면 엔진이 이미 지나간 열차를 답으로 내놓는다 —
   * "언제 나가야 하나"에 과거를 답하는 셈이라 반드시 넘겨야 한다.
   */
  notBefore?: Date,
): SolveResult {
  let deadline = targetArrival
  const legs: Leg[] = []

  for (let i = specs.length - 1; i >= 0; i--) {
    const s = specs[i]

    if (!isDiscrete(s)) {
      const arriveAt = deadline
      const departAt = addMin(arriveAt, -s.durationMin)
      legs.unshift(baseLeg(s, departAt, arriveAt, 0))
      deadline = departAt
      continue
    }

    const buffer = resolveBuffer(s, policy)
    // 도착이 데드라인 이내인 편 중 가장 늦게 떠나는 것.
    let best: { departAt: Date; arriveAt: Date; idx: number } | null = null
    let sawAnyInTime = false
    s.departures!.forEach((dep, idx) => {
      const dur = dep.durationMin ?? s.durationMin
      const arriveAt = addMin(dep.at, dur)
      if (arriveAt.getTime() > deadline.getTime()) return
      sawAnyInTime = true
      // 이미 지나간 편은 탈 수 없다.
      if (notBefore && dep.at.getTime() < notBefore.getTime()) return
      if (!best || dep.at.getTime() > best.departAt.getTime()) {
        best = { departAt: dep.at, arriveAt, idx }
      }
    })

    if (!best) {
      // 제 시간에 닿는 편은 있었는데 전부 과거였다면 "너무 늦음"으로 구분한다.
      return {
        ok: false,
        failure: { reason: sawAnyInTime ? 'too-late' : 'no-departure', atIndex: i },
      }
    }

    const picked = best as { departAt: Date; arriveAt: Date; idx: number }
    const dep = s.departures![picked.idx]
    const legDeadline = addMin(picked.departAt, -buffer)

    legs.unshift({
      ...baseLeg(s, picked.departAt, picked.arriveAt, buffer),
      deadline: legDeadline,
      carrier: dep.carrier,
      seat: dep.seat,
      bookingUrl: dep.bookingUrl,
    })
    deadline = legDeadline
  }

  // 이산 구간이 하나도 없거나 도보만으로 이어진 경우에도 과거 출발은 막는다.
  if (notBefore && legs.length > 0 && legs[0].departAt.getTime() < notBefore.getTime()) {
    return { ok: false, failure: { reason: 'too-late', atIndex: 0 } }
  }

  return { ok: true, legs }
}

/**
 * 지금(또는 지정 시각)부터 앞으로 푼다.
 * 이산 구간에서는 "도착 + 여유" 이후 가장 빠른 편을 잡으므로 대기시간이 저절로 생긴다.
 */
export function solveForward(specs: LegSpec[], from: Date, policy: BufferPolicy): SolveResult {
  let cursor = from
  const legs: Leg[] = []

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]

    if (!isDiscrete(s)) {
      const departAt = cursor
      const arriveAt = addMin(departAt, s.durationMin)
      legs.push(baseLeg(s, departAt, arriveAt, 0))
      cursor = arriveAt
      continue
    }

    const buffer = resolveBuffer(s, policy)
    const readyAt = addMin(cursor, buffer)
    const idx = s.departures!.findIndex((d) => d.at.getTime() >= readyAt.getTime())
    if (idx === -1) return { ok: false, failure: { reason: 'no-departure', atIndex: i } }

    const dep = s.departures![idx]
    const dur = dep.durationMin ?? s.durationMin
    const arriveAt = addMin(dep.at, dur)

    legs.push({
      ...baseLeg(s, dep.at, arriveAt, buffer),
      deadline: addMin(dep.at, -buffer),
      waitMin: Math.max(0, diffMin(dep.at, readyAt)),
      carrier: dep.carrier,
      seat: dep.seat,
      bookingUrl: dep.bookingUrl,
    })
    cursor = arriveAt
  }

  return { ok: true, legs }
}

/**
 * 역산 결과를 실제 여정으로 정돈한다.
 *
 * solveBackward 는 "늦어도 언제까지"를 준다. 그래서 이산 구간이 목표보다
 * 한참 일찍 끝나면, 남는 시간이 뒤쪽 연속 구간(도보 등)에 숨어버린다 —
 * 4시간짜리 버스가 20시간 걸린 것처럼 보이는 이유다.
 *
 * 첫 구간의 출발 시각("언제 나가야 하는가")은 그대로 두고, 그 뒤를 앞으로
 * 당겨 붙여 실제 도착 시각과 대기시간을 드러낸다.
 */
export function compact(legs: Leg[]): Leg[] {
  if (legs.length === 0) return legs
  const out: Leg[] = [{ ...legs[0] }]

  for (let i = 1; i < legs.length; i++) {
    const prev = out[i - 1]
    const leg = { ...legs[i] }

    if (leg.discrete) {
      // 시간표가 고정이므로 출발 시각은 못 옮긴다. 앞 구간 도착과의 간격이 곧 대기.
      leg.waitMin = Math.max(0, diffMin(leg.departAt, prev.arriveAt))
    } else {
      const duration = diffMin(leg.arriveAt, leg.departAt)
      leg.departAt = prev.arriveAt
      leg.arriveAt = addMin(leg.departAt, duration)
      leg.waitMin = 0
    }
    out.push(leg)
  }
  return out
}
