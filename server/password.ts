import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

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
export const MAX_LENGTH = 128
export const MIN_LENGTH = 8

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

export interface PasswordProblem {
  code:
    | 'too-short'
    | 'too-long'
    | 'too-common'
    | 'too-simple'
    | 'looks-like-email'
    | 'needs-upper'
    | 'needs-digit'
    | 'needs-symbol'
  message: string
}

/**
 * 가장 많이 쓰이는 비밀번호들. 자주 뚫리는 것부터 막는다.
 *
 * 목록으로 전부 막을 수는 없다 — 그래서 아래 모양 검사가 같이 있다.
 * 유출 목록 전체(수억 개)를 보려면 HaveIBeenPwned 같은 외부 조회가 필요한데,
 * 그건 가입할 때마다 바깥으로 요청을 보내는 일이라 따로 결정할 문제다.
 */
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'welcome1', 'welcome123',
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000', '87654321',
  'qwerty123', 'qwertyui', 'qwer1234', 'asdf1234', 'zxcvbnm1', '1q2w3e4r', '1qaz2wsx',
  'abcd1234', 'abcdefgh', 'iloveyou', 'sunshine', 'princess', 'football', 'baseball',
  'dragon123', 'monkey123', 'superman', 'trustno1', 'letmein1', 'admin123', 'root1234',
  'samsung1', 'korea123', 'seoul123', 'daehan123', 'computer', 'internet', 'whatever',
])

/**
 * 껍데기를 벗겨 뼈대만 남긴다.
 *
 * 대문자·숫자·특수문자를 요구하면 사람들은 뻔한 단어에 그걸 덧붙인다 —
 * `Password1!`, `P@ssw0rd`, `Qwerty123!`. 규칙은 다 지켰지만 유출 목록
 * 맨 앞에 있는 것들이다. 그래서 꼬리의 숫자·기호를 떼고 흔한 글자 바꿔치기
 * (@→a, 0→o, 1→l, 3→e, $→s)를 되돌린 뒤 흔한 목록과 견준다.
 *
 * 이게 없으면 구성 규칙이 오히려 해롭다. 사람을 뻔한 모양으로 몰아놓고
 * 그 모양을 막지는 않기 때문이다.
 */
function skeleton(pw: string): string {
  return pw
    .toLowerCase()
    .replace(/[^a-z]+$/, '') // 꼬리의 숫자와 기호
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[1|!]/g, 'l')
    .replace(/3/g, 'e')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '')
}

/** 흔한 목록도 같은 방식으로 벗겨 둔다 — 'password123' 과 'Password1!' 이 만난다. */
const COMMON_SKELETONS = new Set([...COMMON].map(skeleton).filter((x) => x.length >= 4))

/** 한 글자만 반복하거나(aaaaaaaa) 연속된 것(12345678, abcdefgh)인지. */
function isSequenceOrRepeat(pw: string): boolean {
  const s = pw.toLowerCase()
  if (new Set(s).size === 1) return true

  let up = true
  let down = true
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1)
    if (d !== 1) up = false
    if (d !== -1) down = false
  }
  return up || down
}

/**
 * 검증은 최소한만 한다.
 *
 * 특수문자·대문자를 반드시 넣게 하는 복잡도 규칙은 두지 않는다. 사람들이
 * `Password1!` 같은 뻔한 모양으로 몰려서 실제 안전성은 거의 안 오르고
 * 기억만 어려워진다는 것이 NIST 800-63B 의 결론이다. 대신 **길이**와
 * **뻔한 모양**을 본다. 그리고 아무리 좋은 규칙도 무한히 찔러볼 수 있으면
 * 소용없으므로, 진짜 방어는 rateLimit 쪽에 있다.
 *
 * @param email 있으면 이메일에서 따온 비밀번호인지도 본다.
 */
export function checkPassword(password: string, email?: string): PasswordProblem | null {
  if (password.length < MIN_LENGTH) {
    return { code: 'too-short', message: `비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다` }
  }
  // 길이 상한이 없으면 아주 긴 입력으로 서버 CPU 를 태울 수 있다
  if (password.length > MAX_LENGTH) {
    return { code: 'too-long', message: `비밀번호는 ${MAX_LENGTH}자 이하여야 합니다` }
  }
  if (COMMON.has(password.toLowerCase()) || COMMON_SKELETONS.has(skeleton(password))) {
    return { code: 'too-common', message: '너무 흔한 비밀번호입니다' }
  }
  if (isSequenceOrRepeat(password)) {
    return { code: 'too-simple', message: '연속되거나 반복되는 문자만으로는 안 됩니다' }
  }
  const local = email?.split('@')[0]?.trim().toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
    return { code: 'looks-like-email', message: '이메일과 너무 비슷합니다' }
  }

  /*
   * 대문자·숫자·특수문자를 요구한다.
   *
   * NIST 는 이런 구성 규칙을 권하지 않는다 — 사람들이 `Password1!` 같은
   * 뻔한 모양으로 몰려서 실제 안전성은 거의 안 오르고 기억만 어려워진다는
   * 것이 그쪽 결론이다. 그래도 두는 이유는 위의 흔한 비밀번호 목록과
   * 모양 검사가 그 뻔한 것들을 따로 걸러주기 때문이다. 둘을 같이 두면
   * "규칙은 지켰지만 뻔한 것" 이 빠져나가지 못한다.
   */
  if (!/[A-Z]/.test(password)) {
    return { code: 'needs-upper', message: '영문 대문자를 하나 이상 넣어 주세요' }
  }
  if (!/[0-9]/.test(password)) {
    return { code: 'needs-digit', message: '숫자를 하나 이상 넣어 주세요' }
  }
  // 영문·숫자·공백이 아닌 것은 모두 특수문자로 친다. 목록을 정해두면
  // 키보드마다 없는 글자를 요구하게 된다.
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return { code: 'needs-symbol', message: '특수문자를 하나 이상 넣어 주세요' }
  }
  return null
}
