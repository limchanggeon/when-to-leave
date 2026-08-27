import type { LegSpec, Place } from '../../engine/types'
import type { AdapterResult, RouteAdapter, RouteRequest } from '../types'
import { fail } from '../types'

const SOURCE = 'odsay:korea'

interface WireLeg {
  kind: 'walk' | 'subway' | 'bus'
  from: Place
  to: Place
  durationMin: number
  carrier?: string
  confidence: 'live' | 'scheduled' | 'estimated'
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
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: req.from, to: req.to }),
      })
      const json = (await res.json()) as
        | { legs: WireLeg[] }
        | { error: { code: string; message: string } }

      if (!res.ok || 'error' in json) {
        const err = 'error' in json ? json.error : { code: 'upstream-error', message: '' }
        // 서버가 준 코드를 그대로 쓴다. 모르는 코드만 upstream-error 로 접는다.
        const known = ['no-credentials', 'no-data', 'network', 'upstream-error'] as const
        const code = (known as readonly string[]).includes(err.code)
          ? (err.code as (typeof known)[number])
          : 'upstream-error'
        return fail(code, SOURCE, err.message)
      }

      if (json.legs.length === 0) return fail('no-data', SOURCE, '경로 구간이 비어 있습니다')

      return {
        ok: true,
        data: json.legs.map((leg) => ({
          kind: leg.kind,
          from: leg.from,
          to: leg.to,
          durationMin: leg.durationMin,
          confidence: leg.confidence,
          source: SOURCE,
          origin: 'live' as const,
        })),
      }
    } catch (e) {
      return fail('network', SOURCE, `서버에 연결하지 못했습니다 (${String(e)})`)
    }
  },
}
