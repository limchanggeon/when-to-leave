import type { Account } from './types'

/**
 * 서버와 주고받는 인증 API.
 * 토큰은 서버가 쥐고 있고, 브라우저에는 httpOnly 세션 쿠키만 남는다 —
 * 그래서 이 함수들은 전부 credentials: 'include' 가 필요하다.
 */
type ApiError = { error: { code: string; message: string } }

export async function fetchMe(): Promise<Account | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    const json = (await res.json()) as { account: Account | null }
    return json.account
  } catch {
    return null // 서버가 안 떠 있어도 앱은 계속 동작해야 한다
  }
}

export async function exchangeKakaoCode(
  code: string,
  redirectUri: string,
): Promise<{ ok: true; account: Account } | { ok: false; message: string }> {
  try {
    const res = await fetch('/api/auth/kakao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code, redirectUri }),
    })
    const json = (await res.json()) as { account: Account } | ApiError
    if (!res.ok || 'error' in json) {
      const message = 'error' in json ? json.error.message : '로그인에 실패했습니다'
      return { ok: false, message }
    }
    return { ok: true, account: json.account }
  } catch {
    return { ok: false, message: '서버에 연결하지 못했습니다 — pnpm server 가 떠 있는지 확인하세요' }
  }
}

export async function serverLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    /* 서버가 없어도 클라이언트 상태는 지운다 */
  }
}

export type EmailAuthResult =
  | { ok: true; account: Account }
  /** 가입은 계정을 바로 주지 않는다 — 메일 속 링크를 눌러야 로그인된다. */
  | { ok: true; sent: true; mailed?: boolean }
  | { ok: false; message: string; code?: string }

async function post(path: string, body: unknown): Promise<EmailAuthResult> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { account: Account } | { sent: true; mailed?: boolean } | ApiError
    if (!res.ok || 'error' in json) {
      return {
        ok: false,
        message: 'error' in json ? json.error.message : '요청에 실패했습니다',
        code: 'error' in json ? json.error.code : undefined,
      }
    }
    if ('sent' in json) return { ok: true, sent: true, mailed: json.mailed }
    return { ok: true, account: json.account }
  } catch {
    return { ok: false, message: '서버에 연결하지 못했습니다 — pnpm server 가 떠 있는지 확인하세요' }
  }
}

/** 인증 메일 다시 보내기. 주소가 있든 없든 같은 답이 온다. */
export async function resendVerification(email: string): Promise<EmailAuthResult> {
  return post('/api/auth/verify/resend', { email })
}

export const registerWithEmail = (email: string, password: string, name: string) =>
  post('/api/auth/register', { email, password, name })

export const loginWithEmail = (email: string, password: string) =>
  post('/api/auth/login', { email, password })

/** 구글 ID 토큰을 서버로 넘겨 검증받는다. 브라우저는 토큰을 해석하지 않는다. */
export const verifyGoogleCredential = (credential: string) =>
  post('/api/auth/google', { credential })
