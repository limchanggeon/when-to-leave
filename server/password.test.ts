import { describe, expect, it } from 'vitest'
import { scryptSync } from 'node:crypto'
import { MAX_LENGTH, checkPassword, hashPassword, verifyPassword } from './password'

describe('해싱', () => {
  it('맞는 비밀번호만 통과한다', async () => {
    const stored = await hashPassword('correct horse battery')
    expect((await verifyPassword('correct horse battery', stored)).ok).toBe(true)
    expect((await verifyPassword('correct horse batteru', stored)).ok).toBe(false)
  })

  it('같은 비밀번호라도 저장값이 매번 다르다 — 소금을 새로 뽑기 때문', async () => {
    const a = await hashPassword('same-password-here')
    const b = await hashPassword('same-password-here')
    expect(a).not.toBe(b)
  })

  it('저장값에 계수가 적혀 있다 — 다음에 올릴 때 추측하지 않아도 된다', async () => {
    const stored = await hashPassword('some-password-x')
    expect(stored.split('$').slice(0, 4)).toEqual(['scrypt', '65536', '8', '2'])
  })

  it('옛 형식도 읽되, 다시 해싱해야 한다고 알려준다', async () => {
    // 계수를 안 적던 시절의 저장값: scrypt$<salt>$<hash> (node 기본 N=16384)
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
    const hash = scryptSync('legacy-password', salt, 64)
    const legacy = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`

    const good = await verifyPassword('legacy-password', legacy)
    expect(good.ok).toBe(true)
    expect(good.needsRehash).toBe(true)

    expect((await verifyPassword('wrong-password!!', legacy)).ok).toBe(false)
  })

  it('지금 계수로 저장된 것은 다시 해싱하지 않는다', async () => {
    const stored = await hashPassword('fresh-password-1')
    expect((await verifyPassword('fresh-password-1', stored)).needsRehash).toBe(false)
  })

  it('망가진 저장값에 터지지 않는다', async () => {
    for (const bad of ['', 'scrypt', 'scrypt$$', 'bcrypt$a$b', 'scrypt$x$y$z$w$v']) {
      expect((await verifyPassword('anything', bad)).ok).toBe(false)
    }
  })
})

describe('비밀번호 규칙', () => {
  it('평범하고 긴 비밀번호는 통과한다', () => {
    expect(checkPassword('바다거북수프12', 'someone@example.com')).toBeNull()
    expect(checkPassword('tR0ubador&3xyz')).toBeNull()
  })

  it('8자 미만은 막는다', () => {
    expect(checkPassword('abc123')?.code).toBe('too-short')
  })

  it('상한을 둔다 — 없으면 긴 입력으로 서버 CPU 를 태울 수 있다', () => {
    expect(checkPassword('a1B'.repeat(200))?.code).toBe('too-long')
    expect(checkPassword('a1B'.repeat(200))?.message).toContain(String(MAX_LENGTH))
  })

  it('흔한 비밀번호는 대소문자 상관없이 막는다', () => {
    expect(checkPassword('password123')?.code).toBe('too-common')
    expect(checkPassword('Password123')?.code).toBe('too-common')
    expect(checkPassword('QWERTY123')?.code).toBe('too-common')
  })

  it('연속·반복만으로는 안 된다 — 길이만 채운 것들', () => {
    expect(checkPassword('12345678')?.code).toBeDefined()
    expect(checkPassword('abcdefghij')?.code).toBe('too-simple')
    expect(checkPassword('aaaaaaaaaa')?.code).toBe('too-simple')
    expect(checkPassword('987654321')?.code).toBe('too-simple')
  })

  it('이메일에서 따온 것은 막는다', () => {
    expect(checkPassword('changgeon1234', 'changgeon@example.com')?.code).toBe('looks-like-email')
    // 이메일을 안 넘기면 이 검사는 하지 않는다
    expect(checkPassword('changgeon1234')).toBeNull()
  })

  it('특수문자·공백·한글을 막지 않는다 — 못 쓰게 하면 오히려 약해진다', () => {
    expect(checkPassword("O'Brien's cat!")).toBeNull()
    expect(checkPassword('비밀번호 두 단어')).toBeNull()
    expect(checkPassword('"; DROP TABLE users; --')).toBeNull()
  })
})
