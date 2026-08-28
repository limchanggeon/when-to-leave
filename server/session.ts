import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { serverEnv } from './env'
import { db } from './db/index'
import { findById, type User } from './users'

/**
 * 세션. 저장소는 SQLite 다 — 예전에는 프로세스 메모리라
 * 서버를 재시작할 때마다 전원 로그아웃됐다.
 *
 * 쿠키에는 "<세션id>.<서명>" 이 들어간다. 서명이 있어야
 * 남의 세션 id 를 찍어 넣는 시도를 DB 조회 전에 걸러낼 수 있다.
 */
const TTL_MS = 1000 * 60 * 60 * 24 * 14 // 2주
export const COOKIE_NAME = 'wtl_session'

const sign = (id: string) => createHmac('sha256', serverEnv.sessionSecret).update(id).digest('hex')

export function createSession(userId: string): string {
  const id = randomBytes(24).toString('hex')
  const now = Date.now()
  db()
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, now, now + TTL_MS)
  return `${id}.${sign(id)}`
}

export function readSession(token: string | undefined): User | null {
  if (!token) return null
  const [id, sig] = token.split('.')
  if (!id || !sig) return null

  // 서명 검증 — 쿠키 값을 고쳐 남의 세션을 노리는 걸 막는다
  const expected = sign(id)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const row = db()
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .get(id) as { user_id: string; expires_at: number } | undefined
  if (!row) return null

  if (row.expires_at < Date.now()) {
    db().prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return null
  }
  return findById(row.user_id)
}

export function destroySession(token: string | undefined): void {
  const id = token?.split('.')[0]
  if (id) db().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

/** 만료된 세션 정리. 서버 시작 때 한 번 부른다. */
export function purgeExpiredSessions(): number {
  const r = db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  return Number(r.changes ?? 0)
}

export const cookieOptions = {
  httpOnly: true, // JS 에서 못 읽게 — XSS 로 세션을 훔치는 걸 막는다
  sameSite: 'lax' as const,
  secure: serverEnv.isProd, // 운영(HTTPS)에서만 secure
  maxAge: TTL_MS,
  path: '/',
}
