import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchJson } from './http'

/*
 * 재시도의 최악 시간. 여기가 느슨하면 검색 하나가 통째로 늘어진다 —
 * 검색은 외부 호출 수십 개를 나란히 기다리므로 그중 **하나만** 끝까지
 * 버텨도 사용자가 그만큼 기다린다. 실제로 12.4초짜리 검색이 나왔다.
 */
const original = globalThis.fetch
afterEach(() => {
  globalThis.fetch = original
  vi.useRealTimers()
})

/** 영원히 안 끝나는 상대. abort 신호에만 반응한다. */
const hangs = () =>
  vi.fn((_url: string, init?: RequestInit) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted')
        e.name = 'AbortError'
        rej(e)
      })
    }),
  )

describe('외부 호출 재시도', () => {
  it('POST는 5xx에도 기본 재시도를 하지 않아 중복 일정을 만들지 않는다', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 503 }))
    globalThis.fetch = spy as typeof fetch
    expect((await fetchJson('https://example.test/events', { method: 'POST' })).ok).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
  })
  it.each([200, 503])('헤더 이후 본문이 멈춰도 타임아웃이 적용된다 (%s)', async (status) => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          )
        },
      })
      return new Response(body, { status })
    }) as typeof fetch
    let result: Awaited<ReturnType<typeof fetchJson>> | undefined
    const pending = fetchJson('https://example.test/body', {}, {
      timeoutMs: 50, budgetMs: 120, retries: 0,
    }).then((r) => { result = r })
    await vi.advanceTimersByTimeAsync(150)
    expect(result).toMatchObject({ ok: false, kind: 'timeout' })
    await pending
  })

  it('매번 타임아웃이 나도 예산 안에서 멈춘다', async () => {
    vi.useFakeTimers()
    const spy = hangs()
    globalThis.fetch = spy as unknown as typeof fetch

    const began = Date.now()
    const pending = fetchJson('https://example.test/x', {}, { timeoutMs: 50, budgetMs: 120 })
    await vi.advanceTimersByTimeAsync(120)
    const r = await pending
    const took = Date.now() - began

    expect(r.ok).toBe(false)
    // 50+50+20ms. 실제 타이머의 조기 발화/CPU 부하와 무관하게 예산을 확인한다.
    expect(took).toBe(120)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('빨리 실패하는 상대는 예산이 남아 재시도를 다 쓴다 — 죽은 IP 를 다시 뽑으려는 것', async () => {
    const spy = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    globalThis.fetch = spy as unknown as typeof fetch

    const r = await fetchJson('https://example.test/x', {}, { retries: 3, budgetMs: 8000 })

    expect(r.ok).toBe(false)
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('4xx 는 다시 묻지 않는다 — 같은 답이 온다', async () => {
    const spy = vi.fn(() =>
      Promise.resolve(new Response('nope', { status: 400 })),
    )
    globalThis.fetch = spy as unknown as typeof fetch

    const r = await fetchJson('https://example.test/x', {}, {})

    expect(r.ok).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
