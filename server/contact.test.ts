import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

process.env.DB_PATH = `/tmp/whenigo-contact-test-${randomUUID()}.db`

const { checkContact, BODY_MIN, BODY_MAX, purgeOldContact, CONTACT_KEEP_DAYS } = await import('./contact')
const { db } = await import('./db/index')

describe('checkContact', () => {
  it('제대로 된 문의는 통과시킨다', () => {
    expect(checkContact('a@b.co', '대전에서 인천공항 가는 경로가 이상합니다')).toBeNull()
  })

  it('이메일 형식이 아니면 막는다', () => {
    for (const bad of ['', 'a', 'a@b', 'a b@c.co', '@b.co']) {
      expect(checkContact(bad, '내용을 충분히 적었습니다')?.code).toBe('bad-email')
    }
  })

  it('너무 짧은 내용은 막는다 — 무엇이 문제인지 알 수 없다', () => {
    expect(checkContact('a@b.co', '안녕')?.code).toBe('too-short')
    expect(checkContact('a@b.co', 'x'.repeat(BODY_MIN - 1))?.code).toBe('too-short')
    expect(checkContact('a@b.co', 'x'.repeat(BODY_MIN))).toBeNull()
  })

  it('너무 긴 내용은 막는다 — 저장과 메일 양쪽에 부담이다', () => {
    expect(checkContact('a@b.co', 'x'.repeat(BODY_MAX))).toBeNull()
    expect(checkContact('a@b.co', 'x'.repeat(BODY_MAX + 1))?.code).toBe('too-long')
  })

  it('앞뒤 공백은 길이로 치지 않는다', () => {
    expect(checkContact('  a@b.co  ', `   ${'x'.repeat(BODY_MIN)}   `)).toBeNull()
    expect(checkContact('a@b.co', '        안녕        ')?.code).toBe('too-short')
  })
})

/*
 * 방침에 적은 보유기간을 코드가 실제로 지키는지.
 *
 * 이건 문서와 코드가 어긋나기 쉬운 자리다 — 처음에 방침에는 "3년" 이라
 * 적어두고 지우는 코드는 아예 없었다. 게다가 user_id 가 SET NULL 이라
 * 회원이 탈퇴해도 문의에 적힌 이메일이 남아 있었다.
 */
describe('문의 보유기간', () => {
  it('기간이 지난 문의는 지운다', () => {
    const old = Date.now() - (CONTACT_KEEP_DAYS + 1) * 24 * 60 * 60 * 1000
    db().prepare(
      "INSERT INTO contact_messages (id, from_email, body, created_at) VALUES ('old', 'a@b.com', 'x', ?)",
    ).run(old)

    expect(purgeOldContact()).toBe(1)
    expect(db().prepare("SELECT COUNT(*) c FROM contact_messages WHERE id = 'old'").get()).toEqual({ c: 0 })
  })

  it('기간 안의 문의는 남긴다', () => {
    const recent = Date.now() - 30 * 24 * 60 * 60 * 1000
    db().prepare(
      "INSERT INTO contact_messages (id, from_email, body, created_at) VALUES ('new', 'a@b.com', 'x', ?)",
    ).run(recent)

    purgeOldContact()
    expect(db().prepare("SELECT COUNT(*) c FROM contact_messages WHERE id = 'new'").get()).toEqual({ c: 1 })
  })
})
