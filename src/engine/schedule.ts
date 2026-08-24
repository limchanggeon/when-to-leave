import { addMin, diffMin } from './time'
import { resolveBuffer, type BufferPolicy } from './buffer'
import type { Leg, LegSpec } from './types'

export type SolveFailure = {
  /** no-departure: 창 안에 탈 수 있는 편이 없다. */
  reason: 'no-departure'
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
    s.departures!.forEach((dep, idx) => {
      const dur = dep.durationMin ?? s.durationMin
      const arriveAt = addMin(dep.at, dur)
      if (arriveAt.getTime() > deadline.getTime()) return
      if (!best || dep.at.getTime() > best.departAt.getTime()) {
        best = { departAt: dep.at, arriveAt, idx }
      }
    })

    if (!best) return { ok: false, failure: { reason: 'no-departure', atIndex: i } }

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
