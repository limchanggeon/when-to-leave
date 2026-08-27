import type { AdapterResult, RouteAdapter, RouteRequest } from './types'
import { fail } from './types'
import type { LegSpec } from '../engine/types'

import { liveKoreaAdapter } from './live/koreaLive'

/*
 * 목업은 제거했다.
 *
 * 목업이 있으면 실제 데이터가 없을 때 그럴듯한 가짜가 대신 나온다.
 * 그 가짜는 자기가 아는 범위를 벗어나면 조용히 헛소리를 하고
 * (예: 대전에서 서울 동네역까지 "도보 6분"),
 * 그때마다 목업의 한계를 하나씩 막는 코드가 늘어난다.
 * 데이터가 없으면 없다고 말하는 편이 낫다 — 그러면 <DataGap> 이 뜬다.
 */
const adapters: RouteAdapter[] = [liveKoreaAdapter]

export const registeredAdapters = (): ReadonlyArray<RouteAdapter> => adapters

export async function resolveRoute(req: RouteRequest): Promise<AdapterResult<LegSpec[]>> {
  const candidates = adapters.filter((a) => a.supports(req))

  if (candidates.length === 0) {
    return fail(
      'not-implemented',
      'registry',
      `${req.fromCountry}→${req.toCountry} 구간을 담당하는 어댑터가 없습니다`,
    )
  }

  // 실제 어댑터를 먼저 시도한다. 어떤 어댑터가 답했는지는 각 구간의 origin 에
  // 남아 화면에 그대로 표시된다.
  const ordered = [...candidates].sort(
    (a, b) => (a.origin === 'live' ? -1 : 1) - (b.origin === 'live' ? -1 : 1),
  )

  let lastFailure: AdapterResult<LegSpec[]> | null = null
  for (const adapter of ordered) {
    const result = await adapter.route(req)
    if (result.ok && result.data.length > 0) return result
    lastFailure = result.ok
      ? fail('no-data', adapter.id, '조회는 됐지만 결과가 비어 있습니다')
      : result
  }
  return lastFailure ?? fail('no-data', 'registry')
}
