import { createHash, randomBytes } from 'node:crypto'
import { db } from './db/index'

export type Purpose = 'verify' | 'reset'

/** 메일 인증 링크의 수명. 하루면 충분히 넉넉하고 지나치게 오래 살지 않는다. */
export const VERIFY_TTL_MS = 24 * 60 * 60_000

/**
 * 원문 대신 해시를 저장한다.
 *
 * 링크는 그 자체가 자격증명이다. 표가 새면 원문이 그대로 남의 계정 열쇠가
 * 되므로 비밀번호와 같은 이유로 해싱한다. 다만 여기는 32바이트 난수라
 * 대입할 여지가 없어 scrypt 까지 갈 필요 없이 SHA-256 이면 된다.
 */
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')

/**
 * 새 토큰을 만들고 저장한다. 돌려주는 값(원문)은 이 순간에만 존재한다 —
 * 메일에 실어 보내고 나면 다시 꺼낼 방법이 없다.
 *
 * 같은 목적의 옛 토큰은 지운다. 인증 메일을 다시 받았으면 이전 링크는
 * 죽어야 한다 — 살려두면 유효한 열쇠가 받은편지함에 쌓인다.
 */
export function issue(userId: string, email: string, purpose: Purpose, ttlMs: number): string {
  const raw = randomBytes(32).toString('base64url')
  const now = Date.now()
  const conn = db()
  conn.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose)
  conn
    .prepare(
      `INSERT INTO email_tokens (token_hash, user_id, purpose, email, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(hash(raw), userId, purpose, email, now + ttlMs, now)
  return raw
}

export type ConsumeResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' }

/**
 * 토큰을 쓴다. 한 번만 통한다.
 *
 * 이유를 구분해 돌려주는 건 화면 문구를 위해서다 — 만료됐으면 "다시
 * 보내드릴까요", 이미 썼으면 "이미 확인된 주소입니다" 라고 말할 수 있다.
 * 토큰은 추측할 수 없는 값이라, 이걸 구분해도 새어나가는 정보가 없다.
 */
export function consume(raw: string, purpose: Purpose): ConsumeResult {
  const conn = db()
  const row = conn
    .prepare('SELECT user_id, email, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = ?')
    .get(hash(raw), purpose) as
    | { user_id: string; email: string; expires_at: number; used_at: number | null }
    | undefined

  if (!row) return { ok: false, reason: 'unknown' }
  if (row.used_at !== null) return { ok: false, reason: 'used' }
  if (row.expires_at < Date.now()) return { ok: false, reason: 'expired' }

  conn.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), hash(raw))
  return { ok: true, userId: row.user_id, email: row.email }
}

/** 만료·사용 완료된 것 정리. 서버 시작 때 세션 정리와 같이 부른다. */
export function purgeStaleTokens(): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60_000
  const r = db()
    .prepare('DELETE FROM email_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)')
    .run(Date.now(), cutoff)
  return Number(r.changes ?? 0)
}
