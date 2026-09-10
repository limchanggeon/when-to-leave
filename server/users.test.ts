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

describe('이메일 인증 가입', () => {
  it('메일 확인 전에는 막고 확인 후에는 관리자 승인 없이 로그인한다', async () => {
    const { canSignIn, markEmailVerified, findById } = await import('./users')
    const r = await registerWithPassword('new@example.com', 'Whenigo-2026!', null)
    if (!r.ok) throw new Error('가입 실패')
    expect(canSignIn(r.user)).toBe(false)
    markEmailVerified(r.user.id)
    const user = findById(r.user.id)!
    expect(user.approved).toBe(false)
    expect(canSignIn(user)).toBe(true)
  })

  it('기존 수동 승인 계정은 계속 로그인할 수 있다', async () => {
    const { canSignIn, findByEmail, findById } = await import('./users')
    seed('legacy@example.com', { approved: true })
    expect(canSignIn(findById(findByEmail('legacy@example.com')!.id)!)).toBe(true)
  })

  it('소셜로 소유를 확인하면 미인증 가입자가 심은 비밀번호와 토큰을 없앤다', async () => {
    const { upsertSocialUser, findByEmail, canSignIn } = await import('./users')
    const { issue, consume } = await import('./emailTokens')
    const r = await registerWithPassword('owner@example.com', 'Whenigo-2026!', null)
    if (!r.ok) throw new Error('가입 실패')
    const token = issue(r.user.id, r.user.email, 'verify', 60_000)
    const owner = upsertSocialUser({ provider: 'google', providerUserId: 'owner',
      email: 'owner@example.com', name: 'Owner', avatarUrl: null })
    expect(canSignIn(owner)).toBe(true)
    expect(findByEmail(owner.email)!.password_hash).toBeNull()
    expect(consume(token, 'verify').ok).toBe(false)
  })

  it('해싱 중 소셜 인증이 끝나도 뒤늦은 가입 요청이 비밀번호를 덮어쓰지 않는다', async () => {
    const { upsertSocialUser, findByEmail } = await import('./users')
    seed('race@example.com', {})
    const registration = registerWithPassword('race@example.com', 'Whenigo-2026!', 'Attacker')
    upsertSocialUser({ provider: 'google', providerUserId: 'race',
      email: 'race@example.com', name: 'Owner', avatarUrl: null })
    expect((await registration).ok).toBe(false)
    expect(findByEmail('race@example.com')!.password_hash).toBeNull()
  })
})
