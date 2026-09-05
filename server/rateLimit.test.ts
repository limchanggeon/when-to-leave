import { beforeEach, describe, expect, it } from 'vitest'
import { check, fail, reset, succeed, type Limit } from './rateLimit'

const L: Limit = { windowMs: 1000, max: 3 }

beforeEach(reset)

describe('시도 횟수 제한', () => {
  it('한도까지는 통과하고 그다음부터 막는다', () => {
    for (let i = 0; i < 3; i++) {
      expect(check('a', L)).toBeNull()
      fail('a', L)
    }
    expect(check('a', L)).not.toBeNull()
  })

  it('언제 풀리는지 알려준다', () => {
    for (let i = 0; i < 3; i++) fail('a', L)
    const blocked = check('a', L)
    expect(blocked?.retryAfterSec).toBeGreaterThan(0)
    expect(blocked?.retryAfterSec).toBeLessThanOrEqual(1)
  })

  it('열쇠가 다르면 서로 영향을 주지 않는다', () => {
    for (let i = 0; i < 5; i++) fail('a', L)
    expect(check('a', L)).not.toBeNull()
    expect(check('b', L)).toBeNull()
  })

  it('성공하면 지운다 — 맞힌 사람을 계속 세지 않는다', () => {
    for (let i = 0; i < 3; i++) fail('a', L)
    expect(check('a', L)).not.toBeNull()
    succeed('a')
    expect(check('a', L)).toBeNull()
  })

  it('창이 지나면 다시 열린다', async () => {
    for (let i = 0; i < 3; i++) fail('a', { windowMs: 40, max: 3 })
    expect(check('a', { windowMs: 40, max: 3 })).not.toBeNull()
    await new Promise((r) => setTimeout(r, 60))
    expect(check('a', { windowMs: 40, max: 3 })).toBeNull()
  })
})
