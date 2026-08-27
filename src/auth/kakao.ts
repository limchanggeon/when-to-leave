import { config } from '../config'
import { loadScript, type AuthProvider, type AuthResult } from './types'

const SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js'

type KakaoGlobal = {
  isInitialized(): boolean
  init(key: string): void
  Auth: {
    /**
     * v2 에서 login() 이 사라지고 이걸로 대체됐다.
     * 팝업이 아니라 **전체 페이지 리다이렉트**로 동작하며,
     * 인가 코드를 redirectUri 에 ?code= 로 붙여 돌려준다.
     */
    authorize(opts: { redirectUri: string; scope?: string; state?: string }): void
    logout(cb?: () => void): void
  }
}

declare global {
  interface Window {
    Kakao?: KakaoGlobal
  }
}

/** SDK 를 불러오고 초기화한다. 지도와 로그인이 같은 JS 키를 쓴다. */
export async function ensureKakaoSdk(): Promise<KakaoGlobal | null> {
  const key = config.kakao.jsKey
  if (!key) return null
  try {
    await loadScript(SDK)
  } catch {
    return null
  }
  const Kakao = window.Kakao
  if (!Kakao) return null
  if (!Kakao.isInitialized()) Kakao.init(key)
  return Kakao
}

export const kakaoAuth: AuthProvider = {
  id: 'kakao',
  label: '카카오 로그인',
  configured: Boolean(config.kakao.jsKey),

  /**
   * 리다이렉트를 시작한다. 성공 시 이 함수는 **돌아오지 않는다** —
   * 브라우저가 카카오로 떠나고, 인가 코드를 들고 /auth/kakao/callback 으로 돌아온다.
   * 그래서 반환하는 AuthResult 는 "떠나지 못한 이유"만 담는다.
   */
  async signIn(): Promise<AuthResult> {
    if (!config.kakao.jsKey) {
      return { ok: false, failure: { code: 'not-configured', provider: 'kakao', envVar: 'VITE_KAKAO_JS_KEY' } }
    }

    const Kakao = await ensureKakaoSdk()
    if (!Kakao) return { ok: false, failure: { code: 'sdk-unavailable', provider: 'kakao' } }

    try {
      /*
       * scope 를 일부러 보내지 않는다.
       *
       * 명시하면 콘솔의 [카카오 로그인 > 동의항목]에 켜져 있지 않은 항목을
       * 요청하게 되어 KOE205(설정하지 않은 동의항목)로 거부된다.
       * 생략하면 카카오가 앱에 설정된 동의항목을 그대로 쓰므로
       * 콘솔 설정이 무엇이든 흐름이 끊기지 않는다.
       *
       * 추가 동의(이메일 등)가 필요해지면 그때 콘솔에서 항목을 켜고
       * VITE_KAKAO_SCOPE 로 넘긴다.
       */
      const scope = config.kakao.scope
      Kakao.Auth.authorize({
        redirectUri: config.kakao.redirectUri,
        ...(scope ? { scope } : {}),
      })
      // 여기 도달하면 리다이렉트가 시작된 것. 화면은 곧 사라진다.
      return { ok: false, failure: { code: 'cancelled', provider: 'kakao' } }
    } catch (e) {
      return { ok: false, failure: { code: 'failed', provider: 'kakao', detail: String(e) } }
    }
  },

  async signOut() {
    window.Kakao?.Auth.logout()
  },
}
