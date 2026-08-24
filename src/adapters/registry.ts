import type { AdapterResult, RouteAdapter, RouteRequest } from './types'
import { fail } from './types'
import type { LegSpec } from '../engine/types'

/* ------------------------------------------------------------------ *
 * 목업 제거 방법
 *   1. 아래 import 한 줄과 adapters 배열의 mock 항목을 지운다
 *   2. src/adapters/mock/ 폴더를 통째로 지운다
 * 그러면 실제 어댑터가 없는 구간은 자동으로 'not-implemented' 를 내고,
 * 화면에는 <DataGap> 이 떠서 데이터가 안 들어왔음을 그대로 보여준다.
 * ------------------------------------------------------------------ */
import { mockKoreaAdapter } from './mock/koreaMock'

const adapters: RouteAdapter[] = [
  mockKoreaAdapter, // ← 목업. 실제 어댑터 붙이면 이 줄을 지운다.
]

/** 등록된 어댑터 중 목업이 하나라도 있으면 화면 상단에 배너를 띄운다. */
export const hasMockAdapters = (): boolean => adapters.some((a) => a.origin === 'mock')

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

  // 실제 어댑터를 목업보다 먼저 시도한다. 실제가 실패해도 목업으로 조용히
  // 넘어가지 않는다 — 실패는 실패대로 돌려주고 화면이 그것을 표시한다.
  const ordered = [...candidates].sort((a, b) => (a.origin === 'live' ? -1 : 1) - (b.origin === 'live' ? -1 : 1))

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
