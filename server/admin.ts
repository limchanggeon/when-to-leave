import { db } from './db/index'
import type { User } from './users'

/**
 * 관리자 기능.
 *
 * 사람 계정을 지우고 인증을 통과시키는 권한이라, 두 가지를 지킨다.
 *   1. 한 일을 전부 남긴다(admin_log). 안 남기면 사고가 나도 되짚을 수 없다.
 *   2. 자기 발등을 못 찍게 한다 — 자기 계정 삭제와 자기 권한 회수를 막는다.
 *      혼자 쓰는 서비스에서 그걸 허용하면 관리자가 0명이 되어 되돌릴 길이 없다.
 */
export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  emailVerified: boolean
  /** 관리자가 가입을 승인했는지. 메일 인증을 대신한다. */
  approved: boolean
  /** 등급. 하루 조회 한도가 여기서 갈린다. */
  tier: string
  hasPassword: boolean
  createdAt: number
  providers: string[]
  places: number
  sessions: number
}

export function listUsers(): AdminUserRow[] {
  const rows = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.is_admin, u.email_verified_at, u.approved_at, u.tier, u.created_at,
              (u.password_hash IS NOT NULL) AS has_pw,
              (SELECT COUNT(*) FROM places p WHERE p.user_id = u.id) AS places,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions,
              (SELECT GROUP_CONCAT(i.provider) FROM identities i WHERE i.user_id = u.id) AS providers
         FROM users u
        ORDER BY u.created_at DESC`,
    )
    .all(Date.now()) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: (r.name as string) ?? null,
    isAdmin: Number(r.is_admin) === 1,
    emailVerified: r.email_verified_at !== null,
    approved: r.approved_at !== null,
    tier: String(r.tier ?? 'free'),
    hasPassword: Number(r.has_pw) === 1,
    createdAt: Number(r.created_at),
    providers: r.providers ? String(r.providers).split(',') : [],
    places: Number(r.places),
    sessions: Number(r.sessions),
  }))
}

export interface AdminStats {
  users: number
  verified: number
  admins: number
  places: number
  activeSessions: number
  signupsLast7d: number
}

export function stats(): AdminStats {
  const one = (sql: string, ...args: unknown[]) =>
    Number((db().prepare(sql).get(...(args as never[])) as { c: number }).c)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60_000
  return {
    users: one('SELECT COUNT(*) c FROM users'),
    verified: one('SELECT COUNT(*) c FROM users WHERE email_verified_at IS NOT NULL'),
    admins: one('SELECT COUNT(*) c FROM users WHERE is_admin = 1'),
    places: one('SELECT COUNT(*) c FROM places'),
    activeSessions: one('SELECT COUNT(*) c FROM sessions WHERE expires_at > ?', Date.now()),
    signupsLast7d: one('SELECT COUNT(*) c FROM users WHERE created_at > ?', weekAgo),
  }
}

export type AdminAction =
  
  | 'set-tier'| 'verify-email'
  | 'delete-user'
  | 'revoke-sessions'
  | 'grant-admin'
  | 'revoke-admin'
  | 'approve'
  | 'unapprove'

export function log(
  actor: User,
  action: AdminAction,
  target?: { id: string; email: string },
  detail?: string,
): void {
  db()
    .prepare(
      `INSERT INTO admin_log (actor_user_id, actor_email, action, target_user_id, target_email, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(actor.id, actor.email, action, target?.id ?? null, target?.email ?? null, detail ?? null, Date.now())
}

export interface AdminLogRow {
  id: number
  actorEmail: string
  action: string
  targetEmail: string | null
  detail: string | null
  createdAt: number
}

export function recentLog(limit = 50): AdminLogRow[] {
  const rows = db()
    .prepare('SELECT * FROM admin_log ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: Number(r.id),
    actorEmail: String(r.actor_email),
    action: String(r.action),
    targetEmail: (r.target_email as string) ?? null,
    detail: (r.detail as string) ?? null,
    createdAt: Number(r.created_at),
  }))
}

/** 관리자 여부를 바꾼다. CLI 와 화면이 같이 쓴다. */
export function setAdmin(userId: string, on: boolean): void {
  db().prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(on ? 1 : 0, userId)
}

/** 이 사용자의 세션을 전부 끊는다. */
export function revokeSessions(userId: string): number {
  const r = db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  return Number(r.changes ?? 0)
}

export interface AdminUserDetail {
  id: string
  email: string
  name: string | null
  tier: string
  isAdmin: boolean
  createdAt: number
  emailVerifiedAt: number | null
  approvedAt: number | null
  approvedBy: string | null
  hasPassword: boolean
  /** 소셜 연결. 언제 이었는지까지 본다. */
  identities: { provider: string; createdAt: number }[]
  /** 살아 있는 세션 수와, 가장 최근에 로그인한 시각. */
  sessions: number
  lastLoginAt: number | null
  /** 저장한 장소는 **개수만** 본다. 아래 주석 참고. */
  places: number
  /** 최근 이레의 하루 조회 수. */
  searches: { day: string; count: number }[]
  /** 이 사람이 보낸 문의. 내용은 문의함에서 본다 — 여기서는 몇 건인지만. */
  contacts: number
}

/**
 * 한 사람에 대해 관리자가 볼 것.
 *
 * **저장한 장소의 주소는 담지 않는다.** 개수만 센다. "집" 이라고 저장한
 * 좌표는 그 사람이 사는 곳이고, 승인할지 정하거나 문의에 답하는 데
 * 그게 필요한 적은 없다. 볼 수 있게 해두면 언젠가 보게 된다.
 *
 * 비밀번호 해시도 담지 않는다. 있는지 없는지만 본다.
 */
export function userDetail(id: string): AdminUserDetail | null {
  const conn = db()
  const u = conn
    .prepare(
      `SELECT id, email, name, tier, is_admin, created_at, email_verified_at,
              approved_at, approved_by, (password_hash IS NOT NULL) AS has_pw
         FROM users WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined
  if (!u) return null

  const identities = (
    conn
      .prepare('SELECT provider, created_at FROM identities WHERE user_id = ? ORDER BY created_at')
      .all(id) as Record<string, unknown>[]
  ).map((r) => ({ provider: String(r.provider), createdAt: Number(r.created_at) }))

  const now = Date.now()
  const sess = conn
    .prepare('SELECT COUNT(*) AS n, MAX(created_at) AS last FROM sessions WHERE user_id = ? AND expires_at > ?')
    .get(id, now) as { n: number; last: number | null }

  const searches = (
    conn
      .prepare('SELECT day, count FROM user_daily_searches WHERE user_id = ? ORDER BY day DESC LIMIT 7')
      .all(id) as Record<string, unknown>[]
  ).map((r) => ({ day: String(r.day), count: Number(r.count) }))

  const places = conn.prepare('SELECT COUNT(*) AS n FROM places WHERE user_id = ?').get(id) as { n: number }
  const contacts = conn
    .prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE user_id = ?')
    .get(id) as { n: number }

  return {
    id: String(u.id),
    email: String(u.email),
    name: (u.name as string) ?? null,
    tier: String(u.tier ?? 'free'),
    isAdmin: Number(u.is_admin) === 1,
    createdAt: Number(u.created_at),
    emailVerifiedAt: u.email_verified_at === null ? null : Number(u.email_verified_at),
    approvedAt: u.approved_at === null ? null : Number(u.approved_at),
    approvedBy: (u.approved_by as string) ?? null,
    hasPassword: Number(u.has_pw) === 1,
    identities,
    sessions: Number(sess.n ?? 0),
    lastLoginAt: sess.last === null ? null : Number(sess.last),
    places: Number(places.n ?? 0),
    searches,
    contacts: Number(contacts.n ?? 0),
  }
}
