import { describe, expect, it } from 'vitest'
import { scryptSync } from 'node:crypto'
import { MAX_LENGTH, checkPassword, hashPassword, verifyPassword, describePassword } from './password'

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
    expect(checkPassword('바다거북수프12Z!', 'someone@example.com')).toBeNull()
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
    expect(checkPassword('Achanggeon12347!')).toBeNull()
  })

  it('특수문자·공백·한글을 막지 않는다 — 못 쓰게 하면 오히려 약해진다', () => {
    expect(checkPassword("O'Brien's 7 cats!")).toBeNull()
    expect(checkPassword('비밀번호 두 Z단어9!')).toBeNull()
    expect(checkPassword('"; DROP TABLE users9; --')).toBeNull()
  })

  /*
   * 대문자를 요구하면 **한글만으로 된 비밀번호는 영영 통과하지 못한다** —
   * 한글에는 대소문자가 없다. 규칙을 그렇게 정한 결과이므로 못 박아 둔다.
   * 나중에 한글 사용자를 다시 받으려면 "영문이 섞여 있을 때만 대문자를
   * 요구한다" 로 바꾸면 된다.
   */
  it('한글만으로는 통과할 수 없다 — 대문자를 요구하기 때문', () => {
    expect(checkPassword('바다거북수프열두마리')?.code).toBe('needs-upper')
  })
})

describe('구성 규칙 (대문자·숫자·특수문자)', () => {
  it('셋 다 갖추면 통과한다', () => {
    expect(checkPassword('Whenigo-2026!')).toBeNull()
  })

  it('대문자가 없으면 막는다', () => {
    expect(checkPassword('whenigo-2026!')?.code).toBe('needs-upper')
  })

  it('숫자가 없으면 막는다', () => {
    expect(checkPassword('Whenigo-abc!')?.code).toBe('needs-digit')
  })

  it('특수문자가 없으면 막는다', () => {
    expect(checkPassword('Whenigo2026')?.code).toBe('needs-symbol')
  })

  /*
   * 구성 규칙만 두면 "규칙은 지켰지만 뻔한 것" 이 그대로 통과한다.
   * 흔한 목록과 모양 검사가 앞에서 걸러주는지 못 박아 둔다.
   */
  /*
   * 구성 규칙만 두면 사람들은 뻔한 단어에 대문자·숫자·기호를 덧붙인다.
   * 껍데기를 벗겨 흔한 목록과 견주므로 그것도 걸린다.
   */
  it('규칙을 지켜도 뻔하면 막는다', () => {
    expect(checkPassword('Password1!')?.code).toBe('too-common')
    expect(checkPassword('P@ssw0rd!')?.code).toBe('too-common')
    expect(checkPassword('Qwerty123!')?.code).toBe('too-common')
    expect(checkPassword('Iloveyou1!')?.code).toBe('too-common')
  })

  it('한글도 특수문자로 치지 않는다 — 영문·숫자가 아니면 통과시키되 나머지 규칙은 그대로', () => {
    expect(checkPassword('비밀번호1234')?.code).toBe('needs-upper')
  })
})

describe('describePassword — 화면에 보여줄 규칙 상태', () => {
  const ids = (pw: string, email?: string) =>
    describePassword(pw, email)
      .rules.filter((r) => r.met)
      .map((r) => r.id)

  it('빈 값이면 아무것도 채워지지 않았다', () => {
    const r = describePassword('')
    expect(r.metCount).toBe(0)
    expect(r.ok).toBe(false)
    // 아직 아무것도 안 친 사람에게 "흔한 비밀번호" 라고 하지 않는다
    expect(r.problem).toBeNull()
  })

  it('채운 것만 표시한다', () => {
    expect(ids('abcdefgh')).toEqual(['length'])
    expect(ids('Abcdefgh')).toEqual(['length', 'upper'])
    expect(ids('Abcdefg1')).toEqual(['length', 'upper', 'digit'])
    expect(ids('Abcdefg1!')).toEqual(['length', 'upper', 'digit', 'symbol'])
  })

  it('checkPassword 와 답이 갈리지 않는다', () => {
    // 두 벌이 되면 "다 초록인데 거부당함" 이 난다. 그걸 막는 시험이다.
    for (const pw of ['', 'short', 'abcdefgh', 'Abcdefg1!', 'Password1!', 'aaaaaaaA1!', 'x'.repeat(200)]) {
      expect(describePassword(pw).ok).toBe(checkPassword(pw) === null)
    }
  })

  it('조건을 다 채워도 뻔한 모양이면 문제로 남는다', () => {
    const r = describePassword('Password1!')
    expect(r.metCount).toBe(4)
    expect(r.ok).toBe(false)
    expect(r.problem?.code).toBe('too-common')
  })

  it('규칙으로 이미 보여주는 실패는 문제로 또 말하지 않는다', () => {
    // 대문자가 없는 것은 체크 목록에 이미 회색으로 떠 있다
    const r = describePassword('abcdefg1!')
    expect(r.problem).toBeNull()
    expect(r.ok).toBe(false)
  })

  it('이메일과 닮은 것은 조건을 다 채워도 걸린다', () => {
    const r = describePassword('Chulsoo99!', 'chulsoo@example.com')
    expect(r.metCount).toBe(4)
    expect(r.problem?.code).toBe('looks-like-email')
  })
})
