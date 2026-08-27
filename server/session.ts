import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { serverEnv } from './env'

export interface SessionUser {
  id: string
  provider: 'kakao' | 'google'
  name: string | null
  email: string | null
  avatarUrl: string | null
}

/**
 * 세션 저장소.
 *
 * 지금은 프로세스 메모리다 — 서버를 재시작하면 전부 날아가고,
 * 인스턴스를 여러 대 띄우면 서로 세션을 모른다.
 * 실서비스에서는 Redis 나 DB 로 바꿔야 한다. 이 파일만 갈아 끼우면 된다.
 */
const store = new Map<string, { user: SessionUser; expiresAt: number }>()

const TTL_MS = 1000 * 60 * 60 * 24 * 14 // 2주
export const COOKIE_NAME = 'wtl_session'

const sign = (id: string) => createHmac('sha256', serverEnv.sessionSecret).update(id).digest('hex')

export function createSession(user: SessionUser): string {
  const id = randomBytes(24).toString('hex')
  store.set(id, { user, expiresAt: Date.now() + TTL_MS })
  return `${id}.${sign(id)}`
}

export function readSession(token: string | undefined): SessionUser | null {
  if (!token) return null
  const [id, sig] = token.split('.')
  if (!id || !sig) return null

  // 서명 검증 — 쿠키 값을 고쳐 남의 세션을 노리는 걸 막는다
  const expected = sign(id)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const entry = store.get(id)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    store.delete(id)
    return null
  }
  return entry.user
}

export function destroySession(token: string | undefined): void {
  const id = token?.split('.')[0]
  if (id) store.delete(id)
}

export const cookieOptions = {
  httpOnly: true, // JS 에서 못 읽게 — XSS 로 세션을 훔치는 걸 막는다
  sameSite: 'lax' as const,
  secure: serverEnv.isProd, // 운영(HTTPS)에서만 secure
  maxAge: TTL_MS,
  path: '/',
}
