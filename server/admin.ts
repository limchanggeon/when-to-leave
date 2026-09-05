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
  hasPassword: boolean
  createdAt: number
  providers: string[]
  places: number
  sessions: number
}

export function listUsers(): AdminUserRow[] {
  const rows = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.is_admin, u.email_verified_at, u.created_at,
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
  | 'verify-email'
  | 'delete-user'
  | 'revoke-sessions'
  | 'grant-admin'
  | 'revoke-admin'

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
