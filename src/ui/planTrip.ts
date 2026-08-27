import { resolveRoute, registeredAdapters } from '../adapters/registry'
import type { Failure, RouteRequest } from '../adapters/types'
import { DEFAULT_POLICY } from '../engine/buffer'
import { compareRoutes, reasonFor, type ChosenReason } from '../engine/rank'
import { compact, solveBackward, solveForward } from '../engine/schedule'
import type { Leg, LegSpec, Mode } from '../engine/types'

export interface RouteOption {
  /** 폴백 사다리 단 번호. 기본 경로는 1. */
  rung: number
  legs: Leg[]
  departAt: Date
  arriveAt: Date
}

export type PlanOutcome =
  | { kind: 'gap'; failure: Failure }
  | { kind: 'no-route' }
  | {
      kind: 'trip'
      /** 순위가 가장 높은 경로. */
      chosen: RouteOption
      /** 왜 이게 뽑혔는지 — 화면에 표시한다. */
      reason: ChosenReason
      /** 나머지 후보. 이미 순위대로 정렬돼 있다. */
      others: RouteOption[]
      renegotiated: boolean
      target: Date
    }

type Solved = { ok: true; legs: Leg[] } | { ok: false; tooLate: boolean }

/**
 * 대화 → 경로 조회 → 역산 → 순위 매기기.
 *
 * 어댑터가 준 첫 경로를 그대로 쓰지 않는다. 대안까지 전부 풀어서 견준 뒤
 * 가장 나은 것을 답으로 내놓는다 — 설계 문서의 "출발역 교체는 폴백이 아니라
 * 1순위 검색에 흡수된다"가 이 뜻이다. 수서에서 타는 편이 더 낫다면
 * 그게 기본 답이 되어야지 "대안" 칸에 밀려 있으면 안 된다.
 */
export async function planTrip(
  req: RouteRequest,
  mode: Mode,
  target: Date,
  now: Date,
): Promise<PlanOutcome> {
  const routed = await resolveRoute(req)
  if (!routed.ok) return { kind: 'gap', failure: routed.failure }

  const tidy = (legs: Leg[]) => compact(legs)

  const solveBack = (specs: LegSpec[]): Solved => {
    const r = solveBackward(specs, target, DEFAULT_POLICY, now)
    return r.ok
      ? { ok: true, legs: tidy(r.legs) }
      : { ok: false, tooLate: r.failure.reason === 'too-late' }
  }

  /**
   * 순방향으로 "가장 빨리 언제 도착"을 구한 뒤, 그 도착 시각을 목표로 다시 역산한다.
   * 순방향만 쓰면 중간 환승 대기가 전부 앞에 쌓여
   * "지금 나가세요"라 해놓고 역에서 한 시간을 기다리게 된다.
   */
  const solveFwd = (specs: LegSpec[]): Solved => {
    const forward = solveForward(specs, now, DEFAULT_POLICY)
    if (!forward.ok) return { ok: false, tooLate: false }
    const arrival = forward.legs[forward.legs.length - 1].arriveAt
    const tightened = solveBackward(specs, arrival, DEFAULT_POLICY, now)
    return { ok: true, legs: tidy(tightened.ok ? tightened.legs : forward.legs) }
  }

  let renegotiated = false
  let solve: (specs: LegSpec[]) => Solved

  if (mode === 'departNow') {
    solve = solveFwd
  } else {
    const attempt = solveBack(routed.data)
    if (attempt.ok) {
      solve = solveBack
    } else if (attempt.tooLate) {
      // 목표 시각에 맞추려면 이미 지난 시각에 나갔어야 한다.
      // 빈손으로 돌려보내지 말고 "지금 나가면 언제 도착"으로 바꿔 답한다.
      renegotiated = true
      solve = solveFwd
    } else {
      return { kind: 'no-route' }
    }
  }

  const toOption = (rung: number, specs: LegSpec[]): RouteOption | null => {
    const solved = solve(specs)
    if (!solved.ok) return null
    return {
      rung,
      legs: solved.legs,
      departAt: solved.legs[0].departAt,
      arriveAt: solved.legs[solved.legs.length - 1].arriveAt,
    }
  }

  const options: RouteOption[] = []
  const base = toOption(1, routed.data)
  if (base) options.push(base)

  for (const adapter of registeredAdapters()) {
    if (!adapter.alternatives || !adapter.supports(req)) continue
    const alt = await adapter.alternatives(req)
    if (!alt.ok) continue
    for (const route of alt.data) {
      const option = toOption(route.rung, route.specs)
      if (option) options.push(option)
    }
  }

  if (options.length === 0) return { kind: 'no-route' }

  options.sort((a, b) => compareRoutes(a, b, mode))
  const [chosen, ...others] = options

  return { kind: 'trip', chosen, reason: reasonFor(mode), others, renegotiated, target }
}
