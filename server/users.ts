import { randomUUID } from 'node:crypto'
import { db } from './db/index'
import { fakeVerify, hashPassword, verifyPassword } from './password'

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
}

interface UserRow {
  id: string
  email: string
  password_hash: string | null
  name: string | null
  avatar_url: string | null
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  avatarUrl: r.avatar_url,
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
  | { ok: true; user: User }
  | { ok: false; code: 'email-taken'; message: string }

export async function registerWithPassword(
  email: string,
  password: string,
  name: string | null,
): Promise<RegisterResult> {
  if (findByEmail(email)) {
    return { ok: false, code: 'email-taken', message: '이미 가입된 이메일입니다' }
  }

  const user: UserRow = {
    id: randomUUID(),
    email: normalizeEmail(email),
    password_hash: await hashPassword(password),
    name: name?.trim() || null,
    avatar_url: null,
  }
  db()
    .prepare(
      'INSERT INTO users (id, email, password_hash, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(user.id, user.email, user.password_hash, user.name, user.avatar_url, Date.now())

  return { ok: true, user: toUser(user) }
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

  let user = findByEmail(email) ? toUser(findByEmail(email)!) : null
  if (!user) {
    const id = randomUUID()
    conn
      .prepare(
        'INSERT INTO users (id, email, password_hash, name, avatar_url, created_at) VALUES (?, ?, NULL, ?, ?, ?)',
      )
      .run(id, email, input.name, input.avatarUrl, Date.now())
    user = { id, email, name: input.name, avatarUrl: input.avatarUrl }
  }

  conn
    .prepare(
      'INSERT OR IGNORE INTO identities (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(input.provider, input.providerUserId, user.id, Date.now())

  return user
}
