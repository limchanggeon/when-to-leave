import type { LegSpec, Place } from '../../engine/types'
import type { AdapterResult, LabeledRoute, RouteAdapter, RouteRequest } from '../types'
import { fail } from '../types'
import { decodePolyline } from '../../map/polyline'

const SOURCE = 'kakao+tago:korea'

interface WireLeg {
  kind: LegSpec['kind']
  from: Place
  to: Place
  durationMin: number
  carrier?: string
  confidence: LegSpec['confidence']
  frequencyMin?: number
  runsPerDay?: number
  fare?: number
  /** 실제 운행 시각(TAGO). 있으면 이 구간은 이산 구간이 된다. */
  runs?: { departAt: string; arriveAt: string; carrier: string; fare?: number }[]
  /** 실제 좌표. 접혀서 온다(인코딩 폴리라인) — 여기서 편다. */
  shape?: string
  /** 시외 수단 구분. 순위가 쓴다. */
  tagoKind?: LegSpec['tagoKind']
}

interface WireRoute {
  legs: WireLeg[]
  totalMin: number
}

/** 서버가 실제로 무엇으로 해석했는지. 잘못 잡혔을 때 눈에 보이게 하려고 쓴다. */
export interface ResolvedEnds {
  from: { name: string }
  to: { name: string }
}

let lastResolved: ResolvedEnds | null = null
export const getLastResolved = (): ResolvedEnds | null => lastResolved

const MINUTE = 60_000

/**
 * 서버 응답을 구간 배열로.
 *
 * 실제 운행 시각(runs)이 오면 그 구간을 **이산 구간**으로 만든다.
 * 그래야 엔진이 "이 편을 타려면 언제까지 도착해야 하는가" 를 계산해
 * 앞 구간으로 데드라인을 넘긴다 — 이 앱의 알맹이다.
 * runs 가 없으면 예전처럼 소요시간만 있는 연속 구간이다.
 */
const toSpecs = (legs: WireLeg[]): LegSpec[] =>
  legs.map((leg) => {
    const departures = leg.runs?.map((run) => {
      const at = new Date(run.departAt)
      const arriveAt = new Date(run.arriveAt)
      return {
        at,
        carrier: run.carrier,
        durationMin: Math.max(1, Math.round((arriveAt.getTime() - at.getTime()) / MINUTE)),
        seat: run.fare ? undefined : undefined,
      }
    })

    return {
      kind: leg.kind,
      from: leg.from,
      to: leg.to,
      durationMin: leg.durationMin,
      // 시각표가 붙었으면 추정이 아니라 계획 시간표다
      confidence: departures?.length ? ('scheduled' as const) : leg.confidence,
      carrier: leg.carrier,
      frequencyMin: departures?.length ? undefined : leg.frequencyMin,
      fare: leg.fare,
      // 순위가 "장거리는 시외 수단으로" 를 지키려면 이 구분이 넘어가야 한다
      tagoKind: leg.tagoKind,
      departures: departures?.length ? departures : undefined,
      source: SOURCE,
      origin: 'live' as const,
      shape: leg.shape ? decodePolyline(leg.shape) : undefined,
    }
  })

/** /api/route 응답을 한 번만 받아 route()/alternatives() 가 나눠 쓴다. */
async function fetchRoutes(
  req: RouteRequest,
): Promise<AdapterResult<WireRoute[]>> {
  try {
    const res = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: req.from, to: req.to }),
    })
    const json = (await res.json()) as
      | { routes: WireRoute[]; from?: { name: string }; to?: { name: string } }
      | { error: { code: string; message: string } }

    if (!res.ok || 'error' in json) {
      const err = 'error' in json ? json.error : { code: 'upstream-error', message: '' }
      const known = [
        'no-credentials',
        'no-data',
        'network',
        'upstream-error',
        'region-unsupported',
      ] as const
      const code = (known as readonly string[]).includes(err.code)
        ? (err.code as (typeof known)[number])
        : 'upstream-error'
      return fail(code, SOURCE, err.message)
    }
    if (json.routes.length === 0) return fail('no-data', SOURCE, '경로를 찾지 못했습니다')
    if (json.from && json.to) lastResolved = { from: json.from, to: json.to }
    return { ok: true, data: json.routes }
  } catch (e) {
    return fail('network', SOURCE, `서버에 연결하지 못했습니다 (${String(e)})`)
  }
}

/**
 * 실제 국내 대중교통 경로. 서버의 /api/route 를 거친다 —
 * ODsay·카카오 키는 브라우저에 둘 수 없고 CORS 도 막혀 있다.
 *
 * 한계: ODsay 는 구간 소요시간만 주고 출발 시각표는 주지 않는다.
 * 그래서 모든 구간이 연속 구간으로 온다. 역산 엔진은 그대로 동작하지만
 * 데드라인 전파는 열차 시간표 소스가 붙어야 제 몫을 한다.
 */
export const liveKoreaAdapter: RouteAdapter = {
  id: SOURCE,
  origin: 'live',

  supports: (req) => req.fromCountry === 'KR' && req.toCountry === 'KR',

  async route(req: RouteRequest): Promise<AdapterResult<LegSpec[]>> {
    const routes = await fetchRoutes(req)
    return routes.ok ? { ok: true, data: toSpecs(routes.data[0].legs) } : routes
  },

  /** ODsay 가 준 나머지 경로를 그대로 대안으로 쓴다. */
  async alternatives(req: RouteRequest): Promise<AdapterResult<LabeledRoute[]>> {
    const routes = await fetchRoutes(req)
    if (!routes.ok) return { ok: true, data: [] }
    return {
      ok: true,
      data: routes.data.slice(1).map((r, i) => ({
        rung: i + 2,
        labelKey: 'route.alt',
        specs: toSpecs(r.legs),
      })),
    }
  },
}
