import { db } from './db/index'
import { hashPassword, verifyPassword } from './password'

export interface Identity {
  provider: string
  createdAt: number
}

export function listIdentities(userId: string): Identity[] {
  return (
    db()
      .prepare('SELECT provider, created_at FROM identities WHERE user_id = ? ORDER BY created_at')
      .all(userId) as { provider: string; created_at: number }[]
  ).map((r) => ({ provider: r.provider, createdAt: r.created_at }))
}

export function accountMeta(userId: string): { createdAt: number; hasPassword: boolean } | null {
  const row = db()
    .prepare('SELECT created_at, password_hash FROM users WHERE id = ?')
    .get(userId) as { created_at: number; password_hash: string | null } | undefined
  return row ? { createdAt: row.created_at, hasPassword: row.password_hash !== null } : null
}

export function updateName(userId: string, name: string): void {
  db().prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim() || null, userId)
}

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; code: 'wrong-current' | 'no-password'; message: string }

/**
 * 비밀번호 변경.
 *
 * 소셜로만 가입한 계정은 현재 비밀번호가 없다. 그 경우 현재 비밀번호를
 * 묻지 않고 새로 설정하게 한다 — 세션으로 이미 본인 확인이 된 상태다.
 */
export async function changePassword(
  userId: string,
  current: string | undefined,
  next: string,
): Promise<PasswordChangeResult> {
  const row = db()
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(userId) as { password_hash: string | null } | undefined
  if (!row) return { ok: false, code: 'no-password', message: '계정을 찾지 못했습니다' }

  if (row.password_hash) {
    if (!current || !(await verifyPassword(current, row.password_hash)).ok) {
      return { ok: false, code: 'wrong-current', message: '현재 비밀번호가 올바르지 않습니다' }
    }
  }

  db()
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(await hashPassword(next), userId)
  return { ok: true }
}

/** 계정 삭제. 세션·장소·소셜 연결은 외래키 CASCADE 로 함께 지워진다. */
export function deleteAccount(userId: string): void {
  db().prepare('DELETE FROM users WHERE id = ?').run(userId)
}
