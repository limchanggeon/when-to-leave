import { describe, expect, it, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

/*
 * 계정 인계 규칙. 여기가 틀리면 남의 계정을 가져갈 수 있다 —
 * 실제로 그랬다(2026-09-08). 승인이 메일 인증을 대신하게 바꾸면서
 * 이 규칙만 옛날 그대로 두어, 승인된 계정을 아무나 다시 가입해서
 * 빼앗을 수 있었다.
 */
process.env.DB_PATH = `/tmp/whenigo-users-test-${randomUUID()}.db`

const { db } = await import('./db/index')
const { registerWithPassword, emailAvailable } = await import('./users')

const seed = (email: string, opts: { verified?: boolean; approved?: boolean }) => {
  const now = Date.now()
  db()
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, created_at, email_verified_at, approved_at)
       VALUES (?, ?, 'x', 'x', ?, ?, ?)`,
    )
    .run(randomUUID(), email, now, opts.verified ? now : null, opts.approved ? now : null)
}

beforeEach(() => {
  db().prepare('DELETE FROM users').run()
})

describe('계정 인계', () => {
  it('아무도 증명하지 않은 계정은 이어받는다 — 자리 차지를 막으려고', async () => {
    seed('squat@example.com', {})
    const r = await registerWithPassword('squat@example.com', 'Whenigo-2026!', '진짜 주인')
    expect(r.ok).toBe(true)
  })

  it('메일로 확인된 계정은 못 가져간다', async () => {
    seed('verified@example.com', { verified: true })
    const r = await registerWithPassword('verified@example.com', 'Whenigo-2026!', '남')
    expect(r.ok).toBe(false)
  })

  /* 이 시험이 없어서 구멍이 생겼다. 승인도 증명이다 — 사람이 눈으로 봤다. */
  it('관리자가 승인한 계정도 못 가져간다', async () => {
    seed('approved@example.com', { approved: true })
    const r = await registerWithPassword('approved@example.com', 'Whenigo-2026!', '남')
    expect(r.ok).toBe(false)
  })
})

describe('중복확인', () => {
  it('가입 규칙과 같은 답을 준다', async () => {
    seed('taken@example.com', { approved: true })
    seed('free@example.com', {})
    expect(emailAvailable('taken@example.com')).toBe(false)
    expect(emailAvailable('free@example.com')).toBe(true)
    expect(emailAvailable('nobody@example.com')).toBe(true)

    // "쓸 수 있다" 고 답한 주소는 실제로 가입돼야 한다
    expect((await registerWithPassword('free@example.com', 'Whenigo-2026!', null)).ok).toBe(true)
  })

  it('대소문자를 가리지 않는다 — 저장도 조회도 소문자로 통일한다', () => {
    seed('mixed@example.com', { verified: true })
    expect(emailAvailable('MIXED@Example.COM')).toBe(false)
  })
})
