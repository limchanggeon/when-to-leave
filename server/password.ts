import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LEN = 64
const SALT_LEN = 16

/**
 * 비밀번호 해싱. node:crypto 의 scrypt 를 쓴다 —
 * 메모리를 많이 쓰도록 설계돼 있어 GPU 로 대량 대입하기 어렵다.
 *
 * 저장 형식: scrypt$<salt(hex)>$<hash(hex)>
 * 나중에 알고리즘을 바꾸면 접두사로 구분해 점진적으로 옮길 수 있다.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const hash = await scryptAsync(password, salt, KEY_LEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** 항상 같은 시간이 걸리도록 비교한다(타이밍 공격 방지). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export interface PasswordProblem {
  code: 'too-short' | 'too-common'
  message: string
}

const COMMON = new Set([
  'password', '12345678', 'qwerty123', '11111111', 'password1', '123456789', 'abcd1234',
])

/**
 * 최소한의 검증만 한다. 복잡도 규칙(특수문자 필수 등)은 사용자를 괴롭히는 것에 비해
 * 실제 안전성 기여가 작다고 알려져 있어, 길이와 흔한 비밀번호만 본다.
 */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < 8) {
    return { code: 'too-short', message: '비밀번호는 8자 이상이어야 합니다' }
  }
  if (COMMON.has(password.toLowerCase())) {
    return { code: 'too-common', message: '너무 흔한 비밀번호입니다' }
  }
  return null
}
