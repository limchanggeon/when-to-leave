/**
 * 시도 횟수 제한.
 *
 * 로그인에 이게 없으면 비밀번호 정책을 아무리 조여도 소용이 없다 —
 * 8자든 12자든 무한히 찔러볼 수 있으면 결국 뚫린다. 반대로 제한이 있으면
 * 짧은 비밀번호도 현실적인 시간 안에는 못 맞힌다.
 *
 * 저장소는 프로세스 메모리다. 서버가 하나뿐이라(단일 EC2 + SQLite) 충분하고,
 * 재시작하면 초기화된다 — 잠긴 사람을 영원히 가두지 않는다는 뜻이라
 * 이 규모에서는 오히려 안전한 쪽이다. 서버를 늘리면 여기부터 손봐야 한다.
 */
interface Bucket {
  /** 이 창에서 몇 번 실패했는지 */
  hits: number
  /** 창이 끝나는 시각 */
  until: number
}

const buckets = new Map<string, Bucket>()

/** 창이 지난 것들을 치운다. 안 그러면 Map 이 IP 수만큼 늘어난다. */
function sweep(now: number): void {
  for (const [key, b] of buckets) if (b.until <= now) buckets.delete(key)
}

let lastSweep = 0

export interface Limit {
  /** 창 길이(ms) */
  windowMs: number
  /** 창 안에서 허용하는 실패 횟수 */
  max: number
}

export interface Blocked {
  /** 다시 시도할 수 있을 때까지 남은 초 */
  retryAfterSec: number
}

/** 지금 막혀 있는지. 막혀 있으면 언제 풀리는지 알려준다. */
export function check(key: string, limit: Limit): Blocked | null {
  const now = Date.now()
  if (now - lastSweep > 60_000) {
    sweep(now)
    lastSweep = now
  }
  const b = buckets.get(key)
  if (!b || b.until <= now) return null
  if (b.hits < limit.max) return null
  return { retryAfterSec: Math.max(1, Math.ceil((b.until - now) / 1000)) }
}

/** 실패를 한 번 적는다. 창이 지났으면 새로 연다. */
export function fail(key: string, limit: Limit): void {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.until <= now) {
    buckets.set(key, { hits: 1, until: now + limit.windowMs })
    return
  }
  b.hits += 1
}

/** 성공했으면 지운다 — 맞힌 사람을 계속 세고 있을 이유가 없다. */
export function succeed(key: string): void {
  buckets.delete(key)
}

/**
 * 로그인. IP 와 계정 양쪽으로 센다.
 *
 * IP 만 세면 공격자가 여러 IP 로 한 계정을 두드릴 수 있고,
 * 계정만 세면 한 IP 로 여러 계정을 훑을 수 있다. 둘 다 막아야 한다.
 * 계정 쪽이 더 헐거운 이유는, 같은 사무실에서 여러 사람이 쓰다가
 * 애먼 사람이 잠기는 일을 줄이기 위해서다.
 */
export const LOGIN_IP: Limit = { windowMs: 15 * 60_000, max: 20 }
export const LOGIN_ACCOUNT: Limit = { windowMs: 15 * 60_000, max: 8 }
/**
 * 가입은 성공도 센다 — 계정을 무더기로 만드는 걸 막는 쪽이라서.
 * 다만 형식 검사를 통과한 시도만 센다(index.ts 참고). 비밀번호를 몇 번
 * 잘못 적었다고 한 시간 잠기면 안 된다.
 */
export const REGISTER_IP: Limit = { windowMs: 60 * 60_000, max: 10 }
/** 비밀번호 변경은 현재 비밀번호를 맞혀야 하므로, 그걸 두드리는 것도 막는다. */
export const PASSWORD_USER: Limit = { windowMs: 15 * 60_000, max: 8 }

/** 테스트용 — 창을 통째로 비운다. */
export function reset(): void {
  buckets.clear()
}
