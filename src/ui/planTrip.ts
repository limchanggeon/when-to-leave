import { resolveRoute, registeredAdapters } from '../adapters/registry'
import type { Failure, RouteRequest } from '../adapters/types'
import { DEFAULT_POLICY } from '../engine/buffer'
import { compact, solveBackward, solveForward } from '../engine/schedule'
import type { Leg, LegSpec } from '../engine/types'
import type { AlternativeView } from './components/Alternatives'

export type PlanOutcome =
  | { kind: 'gap'; failure: Failure }
  | { kind: 'no-route' }
  | {
      kind: 'trip'
      legs: Leg[]
      alternatives: AlternativeView[]
      /**
       * 목표 시각을 맞출 수 없어 "가장 빨리 가면 언제"로 바꿔 답한 경우.
       * 설계 문서 폴백 사다리 7단(목표 시각 재협상)에 해당한다.
       */
      renegotiated: boolean
      target: Date
    }

type Solved = { ok: true; legs: Leg[] } | { ok: false; tooLate: boolean }

/**
 * 대화 → 경로 조회 → 역산 → 대안 사다리. UI 는 결과만 그린다.
 * 이 함수는 React 를 모른다 — 나중에 앱으로 옮길 때 그대로 따라간다.
 */
export async function planTrip(
  req: RouteRequest,
  mode: 'arriveBy' | 'departNow',
  target: Date,
  now: Date,
): Promise<PlanOutcome> {
  const routed = await resolveRoute(req)
  if (!routed.ok) return { kind: 'gap', failure: routed.failure }

  // 역산 결과는 "늦어도 언제까지"라 그대로 보여주면 없는 대기가 숨는다.
  const tidy = (legs: Leg[]) => compact(legs)

  const solveBack = (specs: LegSpec[]): Solved => {
    const r = solveBackward(specs, target, DEFAULT_POLICY, now)
    return r.ok ? { ok: true, legs: tidy(r.legs) } : { ok: false, tooLate: r.failure.reason === 'too-late' }
  }
  /**
   * 순방향으로 "가장 빨리 언제 도착"을 구한 뒤, 그 도착 시각을 목표로 다시 역산한다.
   *
   * 순방향만 쓰면 중간 환승에서 생긴 대기가 전부 앞에 쌓여
   * "지금 나가세요"라고 답해놓고 역에서 한 시간을 기다리게 된다.
   * 도착 시각을 유지한 채 가장 늦게 나가도 되는 시각을 찾아 돌려준다.
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

  const primary = solve(routed.data)
  if (!primary.ok) return { kind: 'no-route' }

  const alternatives: AlternativeView[] = []
  for (const adapter of registeredAdapters()) {
    if (!adapter.alternatives || !adapter.supports(req)) continue
    const alt = await adapter.alternatives(req)
    if (!alt.ok) continue
    for (const route of alt.data) {
      const solved = solve(route.specs)
      if (!solved.ok) continue
      alternatives.push({
        rung: route.rung,
        labelKey: route.labelKey,
        legs: solved.legs,
        departAt: solved.legs[0].departAt,
        arriveAt: solved.legs[solved.legs.length - 1].arriveAt,
      })
    }
  }
  alternatives.sort((a, b) => a.rung - b.rung)

  return { kind: 'trip', legs: primary.legs, alternatives, renegotiated, target }
}
