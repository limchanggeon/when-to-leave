import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

/*
 * 관리자가 한 사람에 대해 볼 수 있는 것의 경계.
 *
 * 이 파일이 지키는 건 화면이 아니라 **응답 자체다.** 화면에 안 그리는 것과
 * 응답에 안 담는 것은 다르다 — 담아서 보내면 개발자 도구를 여는 누구든 본다.
 * 항목이 늘어날 때 무심코 SELECT * 로 바꾸면 여기서 걸린다.
 */
process.env.DB_PATH = `/tmp/whenigo-admin-test-${randomUUID()}.db`

const { db } = await import('./db/index')
const { userDetail } = await import('./admin')

const HASH = 'scrypt$16384$8$1$c2FsdA$aGFzaA'
const ADDRESS = '대전 서구 둔산로 100'

const seed = (): string => {
  const id = randomUUID()
  const now = Date.now()
  const conn = db()
  conn
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, created_at, approved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, `u-${id}@example.com`, HASH, '홍길동', now, now)
  conn
    .prepare(
      `INSERT INTO places (id, user_id, label, name, lat, lng, created_at)
       VALUES (?, ?, '집', ?, 36.3504, 127.3845, ?)`,
    )
    .run(randomUUID(), id, ADDRESS, now)
  return id
}

describe('관리자 사용자 상세', () => {
  it('저장한 장소는 개수만 준다 — 주소도 좌표도 응답에 없다', () => {
    const id = seed()
    const detail = userDetail(id)!
    expect(detail.places).toBe(1)

    const wire = JSON.stringify(detail)
    expect(wire).not.toContain(ADDRESS)
    expect(wire).not.toContain('36.3504')
    expect(wire).not.toContain('127.3845')
    expect(wire).not.toContain('집')
  })

  it('비밀번호 해시는 주지 않는다 — 있는지 없는지만', () => {
    const detail = userDetail(seed())!
    expect(detail.hasPassword).toBe(true)
    expect(JSON.stringify(detail)).not.toContain(HASH)
  })

  it('없는 계정은 null', () => {
    expect(userDetail(randomUUID())).toBeNull()
  })
})
