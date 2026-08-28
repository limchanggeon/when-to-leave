import { config } from '../config'
import { verifyGoogleCredential } from './api'
import { loadScript, type AuthProvider, type AuthResult } from './types'

/**
 * 구글이 준 ID 토큰을 서버로 넘겨 검증받는다.
 *
 * 예전에는 브라우저에서 payload 만 디코딩해 계정 정보를 만들었다 —
 * 서명을 보지 않으므로 아무나 지어낸 토큰으로 로그인할 수 있었다.
 * 이제 서명·발급자·대상·만료를 서버가 확인하고 세션 쿠키를 내려준다.
 */
async function exchange(credential: string): Promise<AuthResult> {
  const r = await verifyGoogleCredential(credential)
  return r.ok
    ? { ok: true, account: r.account }
    : { ok: false, failure: { code: 'failed', provider: 'google', detail: r.message } }
}

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
      void exchange(res.credential).then(onResult)
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
          void exchange(res.credential).then(resolve)
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
