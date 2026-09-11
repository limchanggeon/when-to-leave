/**
 * 비밀번호 규칙.
 *
 * **서버와 화면이 같은 파일을 본다.** 규칙이 두 벌이면 반드시 어긋나고,
 * 그러면 사용자는 "체크가 다 초록인데 거부당했다" 를 겪는다 —
 * 아무 표시도 없는 것보다 나쁘다. 그래서 여기 한 곳에만 둔다.
 *
 * 순수 TS 다. node:crypto 도 DOM 도 쓰지 않으므로 서버·웹·앱이 함께 쓴다.
 * 해시(scrypt)는 서버 전용이라 server/password.ts 에 남는다.
 */

/** 길이 상한. 없으면 아주 긴 입력으로 서버 CPU 를 태울 수 있다. */
export const MAX_LENGTH = 128
export const MIN_LENGTH = 8

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

/* ─────────── 화면용: 규칙을 한꺼번에 알려준다 ─────────── */

/**
 * 채워야 하는 것들. 없으면 안 되는 것만 여기 든다.
 *
 * 하지 말아야 할 것(흔한 비밀번호·연속·이메일 닮음)은 넣지 않는다.
 * 기본적으로 지켜지는 것이라 늘 초록으로 떠 있으면 눈에 읽히지 않고,
 * 정작 걸렸을 때 그 하나가 묻힌다. 그건 problem 으로 따로 알린다.
 */
export type RuleId = 'length' | 'upper' | 'digit' | 'symbol'

export interface PasswordRule {
  id: RuleId
  met: boolean
}

export interface PasswordReport {
  /** 채워야 할 것들의 현재 상태. 순서는 화면에 나오는 순서다. */
  rules: PasswordRule[]
  /** 몇 개를 채웠나. */
  metCount: number
  /**
   * 규칙은 지켰지만 걸리는 것. 흔한 비밀번호·연속·이메일 닮음·너무 김.
   * 지켜야 할 것을 다 채워도 이게 남으면 가입은 거절된다.
   */
  problem: PasswordProblem | null
  /** 그대로 제출해도 통과하는가. checkPassword 와 같은 답이다. */
  ok: boolean
}

/**
 * 비밀번호가 규칙을 얼마나 만족했는지 화면에 보여주기 위한 것.
 *
 * `checkPassword` 는 **첫 번째 실패 하나만** 돌려준다. 서버 응답으로는
 * 그게 맞지만(한 번에 하나씩 고치게 된다), 입력하는 동안에는 무엇이
 * 남았는지 다 보여야 한다 — 제출해봐야 아는 건 답답하다.
 */
export function describePassword(password: string, email?: string): PasswordReport {
  const rules: PasswordRule[] = [
    { id: 'length', met: password.length >= MIN_LENGTH && password.length <= MAX_LENGTH },
    { id: 'upper', met: /[A-Z]/.test(password) },
    { id: 'digit', met: /[0-9]/.test(password) },
    { id: 'symbol', met: /[^A-Za-z0-9\s]/.test(password) },
  ]

  /*
   * 남은 문제는 checkPassword 에게 그대로 묻는다. 여기서 다시 구현하면
   * 두 벌이 되고, 두 벌은 반드시 어긋난다 — 이 파일을 만든 이유가 그거다.
   * 채워야 할 것 중 아직 안 된 게 있으면 그것부터 고치면 되므로 숨긴다.
   */
  const problem = checkPassword(password, email)
  const shownAsRule = new Set(['too-short', 'needs-upper', 'needs-digit', 'needs-symbol'])
  const extra = problem && !shownAsRule.has(problem.code) ? problem : null

  return {
    rules,
    metCount: rules.filter((r) => r.met).length,
    problem: password.length > 0 ? extra : null,
    ok: problem === null,
  }
}
