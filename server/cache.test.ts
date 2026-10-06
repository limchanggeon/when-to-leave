import { afterEach, expect, it, vi } from 'vitest'
import { BoundedCache, cachedAsync } from './cache'

afterEach(() => vi.useRealTimers())

it('동일 조회 20개를 합치고 빈 결과 후에는 다시 조회한다', async () => {
  const cache = new BoundedCache<string, Promise<number[]>>(512, 60_000)
  const load = vi.fn(async () => [] as number[])
  await Promise.all(Array.from({ length: 20 }, () => cachedAsync(cache, 'a', load, (v) => !!v.length)))
  expect(load).toHaveBeenCalledTimes(1)
  await cachedAsync(cache, 'a', load)
  expect(load).toHaveBeenCalledTimes(2)
})

it('거절된 외부 조회를 캐시에 남기지 않는다', async () => {
  const cache = new BoundedCache<string, Promise<number>>(2, 60_000)
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(1)
  await expect(cachedAsync(cache, 'a', load)).rejects.toThrow('offline')
  await expect(cachedAsync(cache, 'a', load)).resolves.toBe(1)
})

it('고유 좌표 10,000개를 받아도 설정한 항목 수만 남긴다', () => {
  const cache = new BoundedCache<string, string>(512, 60_000)
  for (let i = 0; i < 10_000; i++) cache.set(String(i), 'route')
  expect(cache.size).toBe(512)
  expect(cache.get('0')).toBeUndefined()
  expect(cache.get('9999')).toBe('route')
})

it('자주 읽어도 TTL이 지나면 최신 값을 다시 받아야 한다', () => {
  vi.useFakeTimers()
  const cache = new BoundedCache<string, number>(2, 100)
  cache.set('a', 1)
  vi.advanceTimersByTime(50)
  expect(cache.get('a')).toBe(1)
  vi.advanceTimersByTime(50)
  expect(cache.get('a')).toBeUndefined()
})

it('한도에 도달하면 덜 쓰는 항목을 비운다', () => {
  const cache = new BoundedCache<string, number>(2, 1000)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.get('a')
  cache.set('c', 3)
  expect(cache.get('b')).toBeUndefined()
  expect(cache.get('a')).toBe(1)
})
