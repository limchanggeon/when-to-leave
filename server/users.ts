import { randomUUID } from 'node:crypto'
import { db } from './db/index'
import { fakeVerify, hashPassword, verifyPassword } from './password'

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  /** 주소를 실제로 확인했는지. 소셜은 제공자가 확인해준 것만 인정한다. */
  emailVerified: boolean
  /** 관리자인지. 화면에서 /admin 을 열 수 있는지도 이 값으로 갈린다. */
  isAdmin: boolean
  /** 관리자가 승인했는지. 메일 인증을 대신한다. */
  approved: boolean
}

interface UserRow {
  id: string
  email: string
  password_hash: string | null
  name: string | null
  avatar_url: string | null
  email_verified_at: number | null
  is_admin: number
  approved_at: number | null
  approved_by: string | null
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  avatarUrl: r.avatar_url,
  emailVerified: r.email_verified_at !== null,
  isAdmin: r.is_admin === 1,
  approved: r.approved_at !== null,
})

/** 이메일은 대소문자를 구분하지 않는다. 저장도 조회도 소문자로 통일한다. */
const normalizeEmail = (email: string) => email.trim().toLowerCase()

export function findByEmail(email: string): UserRow | null {
  return (db()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as UserRow | undefined) ?? null
}

export function findById(id: string): User | null {
  const row = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? toUser(row) : null
}

export type RegisterResult =
  /** 계정이 생겼거나(created) 미인증 계정을 덮어썼다(replaced). 둘 다 메일을 보낸다. */
  | { ok: true; user: User }
  /** 이미 **확인된** 주소다. 화면에는 알리지 않고, 주인에게만 메일로 알린다. */
  | { ok: false; code: 'email-verified-elsewhere'; user: User }

/**
 * 이메일·비밀번호 가입.
 *
 * 이미 있는 주소라도 **아직 확인되지 않았으면 덮어쓴다.** 남의 주소로 미리
 * 가입해두고 자리를 차지하는 걸 막기 위해서다 — 진짜 주인이 다시 가입하면
 * 그 계정을 가져간다. 확인되지 않은 계정은 아무도 그 주소의 주인임을
 * 증명한 적이 없으므로 지켜줄 이유가 없다.
 *
 * 이미 확인된 주소면 아무것도 바꾸지 않는다. 대신 호출한 쪽이 주인에게
 * "누가 이 주소로 가입을 시도했다" 고 알린다.
 */
export async function registerWithPassword(
  email: string,
  password: string,
  name: string | null,
): Promise<RegisterResult> {
  const existing = findByEmail(email)
  if (existing?.email_verified_at !== null && existing !== null) {
    return { ok: false, code: 'email-verified-elsewhere', user: toUser(existing) }
  }

  const hash = await hashPassword(password)
  const now = Date.now()

  if (existing) {
    // 미인증 계정을 이어받는다. 딸린 것들도 같이 지운다 —
    // 앞사람이 저장해둔 장소가 새 주인에게 넘어가면 안 된다.
    const conn = db()
    conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id)
    conn.prepare('DELETE FROM places WHERE user_id = ?').run(existing.id)
    conn.prepare('DELETE FROM email_tokens WHERE user_id = ?').run(existing.id)
    conn
      .prepare('UPDATE users SET password_hash = ?, name = ?, created_at = ? WHERE id = ?')
      .run(hash, name?.trim() || null, now, existing.id)
    return { ok: true, user: toUser({ ...existing, password_hash: hash, name: name?.trim() || null }) }
  }

  const user: UserRow = {
    id: randomUUID(),
    email: normalizeEmail(email),
    password_hash: hash,
    name: name?.trim() || null,
    avatar_url: null,
    email_verified_at: null,
    is_admin: 0,
    approved_at: null,
    approved_by: null,
  }
  db()
    .prepare(
      'INSERT INTO users (id, email, password_hash, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(user.id, user.email, user.password_hash, user.name, user.avatar_url, now)

  return { ok: true, user: toUser(user) }
}

/** 주소를 확인 완료로 표시한다. 이미 확인돼 있으면 시각을 덮어쓰지 않는다. */
export function markEmailVerified(userId: string): void {
  db()
    .prepare('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL')
    .run(Date.now(), userId)
}

/**
 * 이메일·비밀번호 확인.
 *
 * 이메일이 없을 때와 비밀번호가 틀릴 때를 **구분해서 알려주지 않는다** —
 * 구분하면 어떤 이메일이 가입돼 있는지 알아낼 수 있다.
 * 소셜로만 가입한 계정(password_hash 가 null)도 같은 답을 준다.
 *
 * 문구만 같게 해서는 부족하다. 계정이 없을 때 바로 돌아가면 응답이 눈에 띄게
 * 빨라서, 시간만 재도 가입 여부를 알 수 있다. 그래서 없을 때도 같은 무게의
 * 해싱을 한 번 돌린다.
 */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const row = findByEmail(email)
  if (!row?.password_hash) {
    await fakeVerify(password)
    return null
  }

  const { ok, needsRehash } = await verifyPassword(password, row.password_hash)
  if (!ok) return null

  // 옛 계수로 저장된 해시는 맞힌 김에 지금 계수로 올린다.
  // 이때가 평문을 손에 쥐고 있는 유일한 순간이라, 놓치면 영영 못 올린다.
  if (needsRehash) {
    try {
      const upgraded = await hashPassword(password)
      db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(upgraded, row.id)
    } catch {
      // 올리지 못해도 로그인 자체는 성공한 것이다. 다음 로그인에 다시 시도한다.
    }
  }
  return toUser(row)
}

/**
 * 소셜 로그인 → 사용자.
 * 이미 연결된 적이 있으면 그 사용자를, 같은 이메일이 있으면 거기에 연결한다.
 * 둘 다 없으면 새로 만든다(비밀번호 없는 계정).
 */
export function upsertSocialUser(input: {
  provider: 'kakao' | 'google'
  providerUserId: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}): User {
  const conn = db()

  const linked = conn
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
    .get(input.provider, input.providerUserId) as { user_id: string } | undefined
  if (linked) {
    const user = findById(linked.user_id)
    if (user) return user
  }

  // 소셜 제공자가 이메일을 안 주는 경우가 있다(카카오는 검수 전이면 특히).
  // 그때는 제공자 기준의 대체 이메일을 만들어 계정을 구분한다.
  const email = input.email
    ? normalizeEmail(input.email)
    : `${input.provider}_${input.providerUserId}@social.local`

  /*
   * 제공자가 확인해준 주소만 확인 완료로 친다. 우리 코드는 확인된 경우에만
   * 주소를 받아오므로(구글 email_verified, 카카오 is_email_verified),
   * 여기 실제 주소가 왔다는 것 자체가 확인됐다는 뜻이다.
   * 주소를 못 받아 지어낸 @social.local 은 실재하지 않으므로 제외한다.
   */
  const verifiedAt = input.email ? Date.now() : null

  let user = findByEmail(email) ? toUser(findByEmail(email)!) : null
  if (!user) {
    const id = randomUUID()
    conn
      .prepare(
        'INSERT INTO users (id, email, password_hash, name, avatar_url, created_at, email_verified_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
      )
      .run(id, email, input.name, input.avatarUrl, Date.now(), verifiedAt)
    user = {
      id,
      email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      emailVerified: verifiedAt !== null,
      isAdmin: false,
      approved: false,
    }
  } else if (verifiedAt && !user.emailVerified) {
    // 비밀번호로 먼저 가입해 미인증이던 계정에 소셜을 붙였다면, 제공자가
    // 확인해준 것이므로 이 시점에 확인 완료가 된다.
    conn.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(verifiedAt, user.id)
    user = { ...user, emailVerified: true }
  }

  conn
    .prepare(
      'INSERT OR IGNORE INTO identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(input.provider, input.providerUserId, user.id, Date.now())

  return user
}

/**
 * 이 계정으로 로그인할 수 있는가.
 *
 * 주소가 확인됐거나(메일 링크) 관리자가 승인했으면 연다. 둘 중 하나면
 * 된다 — 사람이 눈으로 본 승인이 링크 한 번 누른 것보다 약할 이유가 없다.
 */
export const canSignIn = (u: User): boolean => u.emailVerified || u.approved

/** 관리자가 가입을 승인한다. 이미 승인돼 있으면 시각을 덮어쓰지 않는다. */
export function approveUser(userId: string, byEmail: string): void {
  db()
    .prepare('UPDATE users SET approved_at = ?, approved_by = ? WHERE id = ? AND approved_at IS NULL')
    .run(Date.now(), byEmail, userId)
}

/** 승인을 거둔다. 다시 못 들어온다. */
export function unapproveUser(userId: string): void {
  db().prepare('UPDATE users SET approved_at = NULL, approved_by = NULL WHERE id = ?').run(userId)
}
