import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/*
 * 규칙은 화면과 함께 쓰므로 저쪽에 산다. 여기서는 해시만 다룬다.
 * 그대로 다시 내보내서 부르는 쪽이 바뀔 일은 없게 한다.
 */
export {
  MAX_LENGTH,
  MIN_LENGTH,
  checkPassword,
  describePassword,
  type PasswordProblem,
  type PasswordRule,
  type RuleId,
} from '../src/auth/passwordRules'
import { MAX_LENGTH } from '../src/auth/passwordRules'

interface ScryptParams {
  N: number
  r: number
  p: number
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptParams & { maxmem: number },
) => Promise<Buffer>

const KEY_LEN = 64
const SALT_LEN = 16

/**
 * 지금 쓰는 작업 계수. OWASP 가 권하는 두 번째 단계다
 * (N=2^16, r=8, p=2 — 첫 단계는 N=2^17, r=8, p=1).
 *
 * 첫 단계를 안 쓴 이유는 메모리다. N=2^17 은 해시 한 번에 128MB 를 잡는데
 * 이 서버는 가용 메모리가 500MB 남짓이라, 동시에 서너 명만 로그인해도
 * 바닥난다. p 를 올리면 메모리는 그대로 두고 CPU 만 두 배가 되므로
 * 같은 예산에서 더 안전하다. 서버에서 실제로 재보고 정했다:
 *   N=2^14(예전) 56ms / N=2^16 p=1 228ms / N=2^16 p=2 415ms
 */
const CURRENT: ScryptParams = { N: 65536, r: 8, p: 2 }

/**
 * 예전에 저장된 해시가 쓰던 값 — node 의 scrypt 기본값이다.
 *
 * 저장 형식에 계수를 안 적어둬서, 옛 해시는 이 값으로 읽어야 한다.
 * 그래서 새 형식에는 계수를 같이 적는다. 다음에 또 올릴 때는
 * 이런 추측이 필요 없다.
 */
const LEGACY: ScryptParams = { N: 16384, r: 8, p: 1 }

/** scrypt 가 쓰는 메모리는 대략 128·N·r. 넉넉히 잡아준다. */
const maxmemFor = (o: ScryptParams) => 256 * o.N * o.r * Math.max(1, o.p)

/**
 * 비밀번호 길이 상한.
 *
 * 없으면 아주 긴 문자열로 서버 CPU 를 태울 수 있다 — scrypt 는 일부러
 * 비싼 함수라 그게 그대로 공격이 된다. NIST 는 최소 64자를 허용하라고 하므로
 * 그보다 넉넉한 128 로 둔다. 암호 관리자가 만드는 것도 대개 이 아래다.
 */

const derive = (password: string, salt: Buffer, len: number, o: ScryptParams) =>
  scryptAsync(password, salt, len, { ...o, maxmem: maxmemFor(o) })

/**
 * 비밀번호 해싱. node:crypto 의 scrypt 를 쓴다 —
 * 메모리를 많이 쓰도록 설계돼 있어 GPU 로 대량 대입하기 어렵다.
 *
 * 저장 형식: scrypt$<N>$<r>$<p>$<salt(hex)>$<hash(hex)>
 * 옛 형식(scrypt$<salt>$<hash>)도 읽는다 — 로그인에 성공하면 새 형식으로 옮긴다.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const hash = await derive(password, salt, KEY_LEN, CURRENT)
  return `scrypt$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$${salt.toString('hex')}$${hash.toString('hex')}`
}

interface Parsed {
  params: ScryptParams
  salt: Buffer
  hash: Buffer
  /** 옛 계수로 만들어진 해시인지 — 맞았으면 다시 해싱해 올려야 한다. */
  stale: boolean
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$')
  if (parts[0] !== 'scrypt') return null
  try {
    if (parts.length === 3) {
      // 옛 형식: 계수가 적혀 있지 않다
      return {
        params: LEGACY,
        salt: Buffer.from(parts[1], 'hex'),
        hash: Buffer.from(parts[2], 'hex'),
        stale: true,
      }
    }
    if (parts.length === 6) {
      const [, N, r, p, saltHex, hashHex] = parts
      const params = { N: Number(N), r: Number(r), p: Number(p) }
      if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
        return null
      }
      return {
        params,
        salt: Buffer.from(saltHex, 'hex'),
        hash: Buffer.from(hashHex, 'hex'),
        stale: params.N < CURRENT.N || params.p < CURRENT.p,
      }
    }
  } catch {
    return null
  }
  return null
}

export interface VerifyResult {
  ok: boolean
  /** 맞았지만 옛 계수로 저장돼 있다 — 지금 계수로 다시 저장해야 한다. */
  needsRehash: boolean
}

/** 항상 같은 시간이 걸리도록 비교한다(타이밍 공격 방지). */
export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  const parsed = parse(stored)
  if (!parsed || parsed.hash.length === 0) return { ok: false, needsRehash: false }

  try {
    const actual = await derive(password, parsed.salt, parsed.hash.length, parsed.params)
    const ok = actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash)
    return { ok, needsRehash: ok && parsed.stale }
  } catch {
    return { ok: false, needsRehash: false }
  }
}

/**
 * 아무 계정도 못 찾았을 때 시간을 맞추기 위한 가짜 검사.
 *
 * 없는 이메일이면 즉시 실패하고 있는 이메일이면 400ms 걸리면, 응답 시간만
 * 재도 어떤 이메일이 가입돼 있는지 알 수 있다. 화면 문구를 똑같이 맞춰놔도
 * 시계가 다 알려주는 셈이라, 없을 때도 같은 일을 시킨다.
 */
const DUMMY_SALT = randomBytes(SALT_LEN)
export async function fakeVerify(password: string): Promise<void> {
  try {
    await derive(password, DUMMY_SALT, KEY_LEN, CURRENT)
  } catch {
    /* 시간만 쓰면 되므로 결과는 버린다 */
  }
}
