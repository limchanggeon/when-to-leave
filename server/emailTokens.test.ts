import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/*
 * DB_PATH 는 모듈을 불러올 때 한 번 읽힌다. 그래서 import 보다 먼저 정해야
 * 하고, 그 때문에 이 파일은 동적 import 를 쓴다. 진짜 마이그레이션을 돌린
 * 진짜 파일에 대고 시험한다 — 표 정의를 시험용으로 다시 적으면, 정작
 * 마이그레이션이 틀렸을 때 이 시험이 통과해버린다.
 */
const dir = mkdtempSync(join(tmpdir(), 'whenigo-test-'))
process.env.DB_PATH = join(dir, 'app.db')

type Tokens = typeof import('./emailTokens')
let tokens: Tokens
let conn: import('node:sqlite').DatabaseSync

beforeAll(async () => {
  const { db } = await import('./db/index')
  conn = db()
  conn
    .prepare('INSERT INTO users (id,email,password_hash,name,avatar_url,created_at) VALUES (?,?,?,?,?,?)')
    .run('u1', 'a@example.com', null, null, null, Date.now())
  tokens = await import('./emailTokens')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('메일 토큰', () => {
  it('발급한 토큰으로 한 번 통과한다', () => {
    const raw = tokens.issue('u1', 'a@example.com', 'verify', 60_000)
    const r = tokens.consume(raw, 'verify')
    expect(r).toEqual({ ok: true, userId: 'u1', email: 'a@example.com' })
  })

  it('두 번은 안 통한다', () => {
    const raw = tokens.issue('u1', 'a@example.com', 'verify', 60_000)
    expect(tokens.consume(raw, 'verify').ok).toBe(true)
    expect(tokens.consume(raw, 'verify')).toEqual({ ok: false, reason: 'used' })
  })

  it('원문을 저장하지 않는다 — 표가 새도 링크가 되지 않는다', () => {
    const raw = tokens.issue('u1', 'a@example.com', 'verify', 60_000)
    const rows = conn.prepare('SELECT token_hash FROM email_tokens').all() as { token_hash: string }[]
    expect(rows.some((r) => r.token_hash === raw)).toBe(false)
    expect(rows.some((r) => r.token_hash.length === 64)).toBe(true)
  })

  it('만료된 토큰은 거절한다', () => {
    const raw = tokens.issue('u1', 'a@example.com', 'verify', -1)
    expect(tokens.consume(raw, 'verify')).toEqual({ ok: false, reason: 'expired' })
  })

  it('목적이 다르면 통하지 않는다 — 인증 링크로 비밀번호를 바꿀 수 없다', () => {
    const raw = tokens.issue('u1', 'a@example.com', 'verify', 60_000)
    expect(tokens.consume(raw, 'reset')).toEqual({ ok: false, reason: 'unknown' })
  })

  it('없는 토큰도 조용히 거절한다', () => {
    expect(tokens.consume('아무거나', 'verify')).toEqual({ ok: false, reason: 'unknown' })
  })

  it('다시 발급하면 앞의 링크는 죽는다 — 유효한 열쇠가 받은편지함에 쌓이지 않게', () => {
    const first = tokens.issue('u1', 'a@example.com', 'verify', 60_000)
    const second = tokens.issue('u1', 'a@example.com', 'verify', 60_000)
    expect(tokens.consume(first, 'verify')).toEqual({ ok: false, reason: 'unknown' })
    expect(tokens.consume(second, 'verify').ok).toBe(true)
  })
})
