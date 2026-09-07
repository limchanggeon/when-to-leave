import { resolveRoute, registeredAdapters } from '../adapters/registry'
import type { Failure, RouteRequest } from '../adapters/types'
import { DEFAULT_POLICY } from '../engine/buffer'
import {
  compareRoutes,
  dedupeRoutes,
  pickAlternatives,
  reasonFor,
  routeKey,
  type AltAxis,
  type ChosenReason,
} from '../engine/rank'
import { compact, solveBackward, solveForward } from '../engine/schedule'
import type { Leg, LegSpec, Mode } from '../engine/types'

export interface RouteOption {
  /**
   * 이 경로를 가리키는 이름. 지나는 정류장으로 짓는다.
   *
   * 예전에는 `rung`(폴백 사다리 단 번호)으로 골랐는데, 대안 여럿이 같은
   * 단에서 나오면 번호가 겹쳐 엉뚱한 줄이 함께 켜졌다. 리스트 key 로도
   * 쓰이므로 겹치면 안 된다.
   */
  id: string
  /** 폴백 사다리 단 번호. 기본 경로는 1. */
  rung: number
  legs: Leg[]
  departAt: Date
  arriveAt: Date
  /**
   * 이 경로를 **왜** 대안으로 보여주는가. 고른 경로에는 없다.
   * 화면이 "환승이 한 번 적습니다" 처럼 이 이름을 그대로 띄운다.
   */
  axis?: AltAxis
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
      /**
       * 시각표를 떼고 소요시간만으로 푼 결과인지.
       * 화면은 이걸 보고 "추정" 이라고 밝힌다.
       */
      estimated: boolean
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

  /**
   * 시각표를 떼고 소요시간만 남긴다.
   *
   * 시각표가 있는데 그날 편이 하나도 없는 경우가 있다 — TAGO 의 지하철
   * 토요일 시각표가 비어 있는 노선이 대표적이다. 그때 엔진은 "탈 수 있는 편이
   * 없다" 고 판단해 포기하는데, 정작 경로도 찾았고 각 구간의 소요시간도 있다.
   * 없는 건 시각표뿐이다.
   *
   * 소요시간은 경로 제공자가 준 실제 값이라 지어내는 게 아니다. 다만 몇 시
   * 열차를 타는지 모르는 채 계산한 것이므로 confidence 를 estimated 로 낮춰
   * 화면이 그 사실을 그대로 보이게 한다.
   */
  const withoutTimetables = (specs: LegSpec[]): LegSpec[] =>
    specs.map((s) =>
      s.departures?.length ? { ...s, departures: undefined, confidence: 'estimated' as const } : s,
    )

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
  let estimated = false
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
      /*
       * 시각표에 그날 편이 아예 없다(no-departure).
       *
       * 여기서 포기하면 "경로를 찾지 못했습니다" 가 뜨는데, 그건 사실이
       * 아니다 — 경로는 찾았고 소요시간도 있다. 없는 건 시각표뿐이다.
       * 시각표를 떼고 다시 풀어 답을 내되, 추정이라고 밝힌다.
       */
      const loose = withoutTimetables(routed.data)
      const back = solveBack(loose)
      if (back.ok) {
        estimated = true
        solve = (specs) => solveBack(withoutTimetables(specs))
      } else if (back.tooLate) {
        estimated = true
        renegotiated = true
        solve = (specs) => solveFwd(withoutTimetables(specs))
      } else {
        return { kind: 'no-route' }
      }
    }
  }

  const toOption = (rung: number, specs: LegSpec[]): RouteOption | null => {
    const solved = solve(specs)
    if (!solved.ok) return null
    return {
      id: routeKey(solved.legs), // pool 에서 접힌 뒤 다시 매기지만, 그 전에도 있어야 타입이 맞는다
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

  /*
   * 순위를 매길 때 쓰는 모드는 **실제로 어떻게 풀었는지**를 따른다.
   *
   * 목표 시각에 못 맞춰 "지금 나가면 언제 도착" 으로 바꿔 풀었으면
   * (renegotiated), 답도 "가장 빨리 닿는 것" 이어야 한다. 그런데 순위는
   * 여전히 arriveBy 규칙, 곧 "가장 늦게 나가는 것" 으로 매기고 있었다.
   *
   * 그래서 오후 4시 40분에 "21시까지 인천공항" 을 물으면 오늘 21:37 에 닿는
   * 길을 두고 **내일 새벽 2시 40분에 나가라**는 답이 나왔다. 늦게 나가는 게
   * 좋다는 규칙을 목표가 사라진 뒤에도 그대로 쓴 탓이다.
   */
  const ranking: Mode = renegotiated ? 'departNow' : mode

  /*
   * 같은 길인 것을 먼저 접는다. 카카오는 한 구간을 611번으로도 622번으로도
   * 갈 수 있으면 두 경로로 주는데, 그건 두 선택지가 아니라 한 경로다.
   */
  const pool = dedupeRoutes(options).map((o) => ({ ...o, id: routeKey(o.legs) }))
  pool.sort((a, b) => compareRoutes(a, b, ranking))
  const [chosen] = pool

  /*
   * 대안은 축마다 하나씩만 고른다 — 최소 환승, 최소 도보, 가장 빠름.
   *
   * 예전에는 1등만 빼고 나머지를 그대로 보여줬다. 그러면 비슷비슷한 것이
   * 줄줄이 남아서, 고르라고 내놓았지만 고를 것이 없었다. 실제로 대전 →
   * 인천공항의 대안 셋이 전부 8366 → 5000,5005 를 지나는 같은 길이었다.
   */
  const alts = pickAlternatives(chosen, pool, ranking)
  const others = alts.map(({ axis, route }) => ({ ...route, axis }))

  return {
    kind: 'trip',
    chosen,
    reason: reasonFor(ranking),
    others,
    renegotiated,
    estimated,
    target,
  }
}
