import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./tago', () => ({ tagoCall: vi.fn() }))
import { tagoCall } from './tago'
import { routeStops } from './busRoutes'
afterEach(() => vi.clearAllMocks())

it('노선 20개 동시 요청이 외부 조회 2개를 공유하며 정류소 순서를 보존한다', async () => {
  vi.mocked(tagoCall).mockImplementation(async (_service, method) => {
    if (method === 'getRouteNoList') return [{ routeid: 'test-route', routeno: '603' }] as never
    return [
      { nodeord: 2, nodenm: '도착', gpslati: 36.31, gpslong: 127.31 },
      { nodeord: 1, nodenm: '출발', gpslati: 36.3, gpslong: 127.3 },
    ] as never
  })
  const rows = await Promise.all(Array.from({ length: 20 }, () =>
    routeStops({ kind: 'tago', cityCode: 25 }, '603'),
  ))
  expect(tagoCall).toHaveBeenCalledTimes(2)
  expect(rows[0][0].map((s) => s.name)).toEqual(['출발', '도착'])
  expect(rows.every((row) => JSON.stringify(row) === JSON.stringify(rows[0]))).toBe(true)
})
