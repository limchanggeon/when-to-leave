import { config } from '../config'
import { loadScript, type AuthProvider, type AuthResult } from './types'

const SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js'

// 카카오 SDK 는 전역에 붙는다. 필요한 부분만 좁게 선언한다.
type KakaoGlobal = {
  isInitialized(): boolean
  init(key: string): void
  Auth: {
    login(opts: {
      success: (res: { access_token: string }) => void
      fail: (err: unknown) => void
    }): void
    logout(cb?: () => void): void
  }
  API: {
    request(opts: { url: string }): Promise<{
      id: number
      kakao_account?: {
        email?: string
        profile?: { nickname?: string; profile_image_url?: string }
      }
    }>
  }
}

declare global {
  interface Window {
    Kakao?: KakaoGlobal
  }
}

export const kakaoAuth: AuthProvider = {
  id: 'kakao',
  label: '카카오로 계속하기',
  configured: Boolean(config.kakao.jsKey),

  async signIn(): Promise<AuthResult> {
    const key = config.kakao.jsKey
    if (!key) {
      return { ok: false, failure: { code: 'not-configured', provider: 'kakao', envVar: 'VITE_KAKAO_JS_KEY' } }
    }

    try {
      await loadScript(SDK)
    } catch {
      return { ok: false, failure: { code: 'sdk-unavailable', provider: 'kakao' } }
    }

    const Kakao = window.Kakao
    if (!Kakao) return { ok: false, failure: { code: 'sdk-unavailable', provider: 'kakao' } }
    if (!Kakao.isInitialized()) Kakao.init(key)

    return new Promise<AuthResult>((resolve) => {
      Kakao.Auth.login({
        success: async () => {
          try {
            const me = await Kakao.API.request({ url: '/v2/user/me' })
            const acc = me.kakao_account
            resolve({
              ok: true,
              account: {
                id: String(me.id),
                provider: 'kakao',
                name: acc?.profile?.nickname ?? null,
                email: acc?.email ?? null,
                avatarUrl: acc?.profile?.profile_image_url ?? null,
              },
            })
          } catch (e) {
            resolve({ ok: false, failure: { code: 'failed', provider: 'kakao', detail: String(e) } })
          }
        },
        fail: () => resolve({ ok: false, failure: { code: 'cancelled', provider: 'kakao' } }),
      })
    })
  },

  async signOut() {
    window.Kakao?.Auth.logout()
  },
}
