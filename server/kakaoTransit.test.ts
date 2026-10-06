import { afterEach, expect, it, vi } from 'vitest'

vi.mock('./env', () => ({ serverEnv: { kakaoRestKey: 'test' } }))
vi.mock('./http', () => ({ fetchJson: vi.fn() }))
import { fetchJson } from './http'
import { walkLeg } from './kakaoTransit'

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

it('도보 동시 요청은 한 번 조회하고 5분 후 실패 추정값을 갱신한다', async () => {
  vi.useFakeTimers()
  vi.mocked(fetchJson).mockResolvedValue({ ok: false, kind: 'network', message: 'offline' })
  const a = { name: '출발', lat: 36.3, lng: 127.3 }
  const b = { name: '도착', lat: 36.31, lng: 127.31 }
  const results = await Promise.all(Array.from({ length: 20 }, () => walkLeg(a, b)))
  expect(fetchJson).toHaveBeenCalledTimes(1)
  expect(results[0]?.confidence).toBe('estimated')
  expect(results.every((r) => r?.durationMin === results[0]?.durationMin)).toBe(true)
  vi.advanceTimersByTime(300_000)
  await walkLeg(a, b)
  expect(fetchJson).toHaveBeenCalledTimes(2)
})
