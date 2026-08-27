import { config } from '../config'
import { loadScript, type Account, type AuthProvider, type AuthResult } from './types'

const SDK = 'https://accounts.google.com/gsi/client'

type GoogleGlobal = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void
      prompt(cb?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void
      renderButton(el: HTMLElement, o: Record<string, string | number>): void
      disableAutoSelect(): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleGlobal
  }
}

/**
 * ID 토큰(JWT)의 payload 를 읽는다.
 *
 * 주의: 이건 **표시용**이다. 서명 검증이 아니다.
 * 실제 인증으로 쓰려면 토큰을 서버로 보내 구글 공개키로 검증해야 한다.
 * 지금은 백엔드가 없어 화면에 이름을 띄우는 용도로만 쓴다.
 */
function decodeIdToken(jwt: string): Account | null {
  try {
    const payload = JSON.parse(
      decodeURIComponent(
        atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    ) as { sub: string; name?: string; email?: string; picture?: string }

    return {
      id: payload.sub,
      provider: 'google',
      name: payload.name ?? null,
      email: payload.email ?? null,
      avatarUrl: payload.picture ?? null,
    }
  } catch {
    return null
  }
}

/**
 * 구글이 직접 그려주는 공식 로그인 버튼.
 *
 * 브랜드 가이드라인상 구글 로고를 임의로 그려 쓰면 안 되는데,
 * renderButton 을 쓰면 규격에 맞는 버튼을 구글이 렌더해준다.
 * 로그인 페이지처럼 버튼을 크게 보여주는 자리에서 이걸 쓴다.
 */
export async function mountGoogleButton(
  el: HTMLElement,
  onResult: (r: AuthResult) => void,
): Promise<{ ok: boolean }> {
  const clientId = config.google.clientId
  if (!clientId) return { ok: false }

  try {
    await loadScript(SDK)
  } catch {
    return { ok: false }
  }

  const google = window.google
  if (!google) return { ok: false }

  google.accounts.id.initialize({
    client_id: clientId,
    callback: (res) => {
      const account = decodeIdToken(res.credential)
      onResult(
        account
          ? { ok: true, account }
          : { ok: false, failure: { code: 'failed', provider: 'google', detail: 'ID 토큰을 읽지 못했습니다' } },
      )
    },
  })
  google.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    locale: 'ko',
    width: 320,
  })
  return { ok: true }
}

export const googleAuth: AuthProvider = {
  id: 'google',
  label: 'Google로 계속하기',
  configured: Boolean(config.google.clientId),

  async signIn(): Promise<AuthResult> {
    const clientId = config.google.clientId
    if (!clientId) {
      return {
        ok: false,
        failure: { code: 'not-configured', provider: 'google', envVar: 'VITE_GOOGLE_CLIENT_ID' },
      }
    }

    try {
      await loadScript(SDK)
    } catch {
      return { ok: false, failure: { code: 'sdk-unavailable', provider: 'google' } }
    }

    const google = window.google
    if (!google) return { ok: false, failure: { code: 'sdk-unavailable', provider: 'google' } }

    return new Promise<AuthResult>((resolve) => {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => {
          const account = decodeIdToken(res.credential)
          resolve(
            account
              ? { ok: true, account }
              : { ok: false, failure: { code: 'failed', provider: 'google', detail: 'ID 토큰을 읽지 못했습니다' } },
          )
        },
      })
      google.accounts.id.prompt((n) => {
        if (n.isNotDisplayed() || n.isSkippedMoment()) {
          resolve({ ok: false, failure: { code: 'cancelled', provider: 'google' } })
        }
      })
    })
  },

  async signOut() {
    window.google?.accounts.id.disableAutoSelect()
  },
}
