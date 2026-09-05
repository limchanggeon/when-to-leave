import { randomUUID } from 'node:crypto'
import { db } from './db/index'
import { sendMail } from './mail'
import { serverEnv } from './env'

export const BODY_MIN = 10
export const BODY_MAX = 4000
export const EMAIL_MAX = 254

export interface ContactMessage {
  id: string
  fromEmail: string
  body: string
  userId: string | null
  createdAt: number
  mailSentAt: number | null
  mailError: string | null
  readAt: number | null
}

interface Row {
  id: string
  from_email: string
  body: string
  user_id: string | null
  created_at: number
  mail_sent_at: number | null
  mail_error: string | null
  read_at: number | null
}

const toMessage = (r: Row): ContactMessage => ({
  id: r.id,
  fromEmail: r.from_email,
  body: r.body,
  userId: r.user_id,
  createdAt: r.created_at,
  mailSentAt: r.mail_sent_at,
  mailError: r.mail_error,
  readAt: r.read_at,
})

export type ContactProblem = { code: 'bad-email' | 'too-short' | 'too-long'; message: string }

/** 형식 검사. 트집을 최소한만 잡는다 — 문의는 문턱이 낮아야 한다. */
export function checkContact(email: string, body: string): ContactProblem | null {
  const e = email.trim()
  if (!e || e.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { code: 'bad-email', message: '회신받을 이메일 주소를 정확히 적어 주세요' }
  }
  const b = body.trim()
  if (b.length < BODY_MIN) {
    return { code: 'too-short', message: `내용을 ${BODY_MIN}자 이상 적어 주세요` }
  }
  if (b.length > BODY_MAX) {
    return { code: 'too-long', message: `내용은 ${BODY_MAX}자 이하로 적어 주세요` }
  }
  return null
}

/** 제목에 쓸 한 줄. 본문 첫 줄을 잘라 쓴다 — 받은편지함에서 골라내기 위해서다. */
const firstLine = (body: string): string => {
  const line = body.trim().split('\n')[0].trim()
  return line.length > 40 ? `${line.slice(0, 40)}…` : line
}

function mailFor(m: ContactMessage): { to: string; subject: string; text: string } {
  const when = new Date(m.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  return {
    to: serverEnv.contactTo,
    subject: `[언제나가] 문의 — ${firstLine(m.body)}`,
    text: [
      `보낸 사람: ${m.fromEmail}`,
      m.userId ? `계정: ${m.userId}` : '계정: (로그인 안 함)',
      `받은 시각: ${when}`,
      '',
      '─────',
      m.body.trim(),
      '─────',
      '',
      `회신은 ${m.fromEmail} 로 하시면 됩니다.`,
    ].join('\n'),
  }
}

/**
 * 문의 접수.
 *
 * **저장이 먼저고 메일은 그다음이다.** 메일이 실패해도 문의는 접수된 것으로
 * 친다 — 보낸 사람 입장에서 그건 사실이고, 우리는 DB 에 갖고 있다.
 * 실패한 이유는 행에 적어 두어 관리 화면에서 보이게 한다.
 */
export async function submitContact(input: {
  email: string
  body: string
  userId: string | null
}): Promise<ContactMessage> {
  const msg: ContactMessage = {
    id: randomUUID(),
    fromEmail: input.email.trim().toLowerCase(),
    body: input.body.trim(),
    userId: input.userId,
    createdAt: Date.now(),
    mailSentAt: null,
    mailError: null,
    readAt: null,
  }

  db()
    .prepare(
      'INSERT INTO contact_messages (id, from_email, body, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(msg.id, msg.fromEmail, msg.body, msg.userId, msg.createdAt)

  const r = await sendMail(mailFor(msg))
  if (r.ok) {
    msg.mailSentAt = Date.now()
    db().prepare('UPDATE contact_messages SET mail_sent_at = ? WHERE id = ?').run(msg.mailSentAt, msg.id)
  } else {
    msg.mailError = r.reason
    db().prepare('UPDATE contact_messages SET mail_error = ? WHERE id = ?').run(r.reason, msg.id)
  }
  return msg
}

export function listContact(limit = 100): ContactMessage[] {
  return (
    db()
      .prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ?')
      .all(limit) as unknown as Row[]
  ).map(toMessage)
}

export function unreadContactCount(): number {
  const r = db()
    .prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE read_at IS NULL')
    .get() as { n: number }
  return Number(r.n ?? 0)
}

export function markContactRead(id: string): void {
  db()
    .prepare('UPDATE contact_messages SET read_at = ? WHERE id = ? AND read_at IS NULL')
    .run(Date.now(), id)
}
