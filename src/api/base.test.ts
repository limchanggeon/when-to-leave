import { describe, expect, it, vi, afterEach } from 'vitest'

/*
 * 앱에서 서버 주소가 안 붙으면 **아무것도 안 된다.** 화면은 멀쩡히 뜨고
 * 요청만 조용히 실패하므로, 눈으로는 늦게 알아챈다. 여기서 잡는다.
 */
const real = globalThis.fetch
afterEach(() => {
  globalThis.fetch = real
  vi.resetModules()
  vi.unstubAllEnvs()
})

const load = async () => (await import('./base')).installApiBase

describe('서버 주소 붙이기', () => {
  it('값이 없으면 fetch 를 건드리지 않는다 — 웹 빌드는 그대로', async () => {
    vi.stubEnv('VITE_API_BASE', '')
    const before = globalThis.fetch
    ;(await load())()
    expect(globalThis.fetch).toBe(before)
  })

  it('/api 로 가는 것에만 주소를 붙인다', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://whenigo.example')
    const spy = vi.fn((_u: unknown, _i?: RequestInit) => Promise.resolve(new Response('{}')))
    globalThis.fetch = spy as unknown as typeof fetch
    ;(await load())()

    await globalThis.fetch('/api/route', { method: 'POST' })
    await globalThis.fetch('https://dapi.kakao.com/v2/maps')
    await globalThis.fetch('/favicon.svg')

    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      'https://whenigo.example/api/route',
      'https://dapi.kakao.com/v2/maps',
      '/favicon.svg',
    ])
  })

  it('끝의 빗금은 없앤다 — 두 번 붙어 //api 가 되지 않게', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://whenigo.example/')
    const spy = vi.fn((_u: unknown, _i?: RequestInit) => Promise.resolve(new Response('{}')))
    globalThis.fetch = spy as unknown as typeof fetch
    ;(await load())()

    await globalThis.fetch('/api/me')
    expect(spy.mock.calls[0][0]).toBe('https://whenigo.example/api/me')
  })

  it('method 와 body 를 그대로 넘긴다', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://whenigo.example')
    const spy = vi.fn((_u: unknown, init?: RequestInit) => {
      void init
      return Promise.resolve(new Response('{}'))
    })
    globalThis.fetch = spy as unknown as typeof fetch
    ;(await load())()

    await globalThis.fetch('/api/contact', { method: 'POST', body: '{"a":1}' })
    expect(spy.mock.calls[0][1]).toEqual({ method: 'POST', body: '{"a":1}' })
  })
})
