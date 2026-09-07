import { randomUUID } from 'node:crypto'
import { db } from './db/index'
import { limitFor, tierOf, type Tier } from './tiers'

/**
 * 하루 조회 한도.
 *
 * **무엇을 검색했는지는 담지 않는다.** 몇 번 했는지만 센다 — 한도를 재는 데
 * 필요한 건 그것뿐이고, 필요 없는 것을 담으면 언젠가 샌다.
 */

/** 한국 날짜. timezone.ts 가 프로세스 시간대를 못 박아 자정이 사람 감각과 맞는다. */
export const today = (d = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface QuotaState {
  tier: Tier
  used: number
  /** null 이면 제한 없음. */
  limit: number | null
  left: number | null
}

export function quotaOf(userId: string, tier: string | null): QuotaState {
  const t = tierOf(tier)
  const limit = limitFor(t)
  const row = db()
    .prepare('SELECT count FROM user_daily_searches WHERE user_id = ? AND day = ?')
    .get(userId, today()) as { count: number } | undefined
  const used = Number(row?.count ?? 0)
  return { tier: t, used, limit, left: limit === null ? null : Math.max(0, limit - used) }
}

/** 한 번 썼다고 센다. 답이 나온 뒤에만 부른다. */
export function bumpSearch(userId: string): void {
  db()
    .prepare(
      `INSERT INTO user_daily_searches (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`,
    )
    .run(userId, today())
}

/* ---------------- 등급 올려달라는 요청 ---------------- */

export interface TierRequest {
  id: string
  userId: string
  email: string
  tier: string
  note: string
  createdAt: number
  handledAt: number | null
}

/**
 * 한 사람이 열어둔 요청은 하나만 둔다.
 *
 * 답을 기다리는 동안 여러 번 누르는 건 자연스러운 일이다. 그때마다 줄이
 * 늘어나면 관리 화면이 같은 사람으로 가득 찬다. 이미 열려 있으면 내용만
 * 새로 쓴다 — 마지막에 한 말이 지금 하고 싶은 말이다.
 */
export function requestTier(userId: string, note: string): void {
  const open = db()
    .prepare('SELECT id FROM tier_requests WHERE user_id = ? AND handled_at IS NULL')
    .get(userId) as { id: string } | undefined
  if (open) {
    db()
      .prepare('UPDATE tier_requests SET note = ?, created_at = ? WHERE id = ?')
      .run(note.trim(), Date.now(), open.id)
    return
  }
  db()
    .prepare('INSERT INTO tier_requests (id, user_id, note, created_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), userId, note.trim(), Date.now())
}

export function openRequests(): TierRequest[] {
  return (
    db()
      .prepare(
        `SELECT r.id, r.user_id, r.note, r.created_at, r.handled_at, u.email, u.tier
           FROM tier_requests r JOIN users u ON u.id = r.user_id
          WHERE r.handled_at IS NULL
          ORDER BY r.created_at DESC`,
      )
      .all() as Record<string, unknown>[]
  ).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    email: String(r.email),
    tier: String(r.tier),
    note: String(r.note),
    createdAt: Number(r.created_at),
    handledAt: r.handled_at === null ? null : Number(r.handled_at),
  }))
}

/** 사람이 확인했다고 표시한다. 등급을 올렸든 안 올렸든 줄에서 치운다. */
export function closeRequest(id: string, byEmail: string): void {
  db()
    .prepare('UPDATE tier_requests SET handled_at = ?, handled_by = ? WHERE id = ? AND handled_at IS NULL')
    .run(Date.now(), byEmail, id)
}

/** 등급을 바꾼다. 열려 있던 요청도 같이 닫는다 — 처리했으니 줄에 남을 이유가 없다. */
export function setTier(userId: string, tier: Tier, byEmail: string): void {
  const conn = db()
  conn.prepare('UPDATE users SET tier = ? WHERE id = ?').run(tier, userId)
  conn
    .prepare('UPDATE tier_requests SET handled_at = ?, handled_by = ? WHERE user_id = ? AND handled_at IS NULL')
    .run(Date.now(), byEmail, userId)
}
