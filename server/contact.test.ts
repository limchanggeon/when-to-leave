import { describe, expect, it } from 'vitest'
import { checkContact, BODY_MIN, BODY_MAX } from './contact'

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
