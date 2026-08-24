import { resolveRoute, registeredAdapters } from '../adapters/registry'
import type { Failure, RouteRequest } from '../adapters/types'
import { DEFAULT_POLICY } from '../engine/buffer'
import { compact, solveBackward, solveForward } from '../engine/schedule'
import type { Leg } from '../engine/types'
import type { AlternativeView } from './components/Alternatives'

export type PlanOutcome =
  | { kind: 'gap'; failure: Failure }
  | { kind: 'no-route' }
  | { kind: 'trip'; legs: Leg[]; alternatives: AlternativeView[] }

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

  const solve = (specs: typeof routed.data) => {
    const r =
      mode === 'arriveBy'
        ? solveBackward(specs, target, DEFAULT_POLICY)
        : solveForward(specs, now, DEFAULT_POLICY)
    // 역산 결과는 "늦어도 언제까지"라 그대로 보여주면 없는 대기가 숨는다.
    return r.ok ? { ok: true as const, legs: compact(r.legs) } : r
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

  return { kind: 'trip', legs: primary.legs, alternatives }
}
