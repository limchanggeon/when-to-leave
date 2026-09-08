import { config } from '../config'
import { loadScript, type AuthProvider, type AuthResult } from './types'

/** 이만큼 기다려도 안 옮겨졌으면 막힌 것으로 본다. */
const REDIRECT_WAIT_MS = 8000

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

    /*
     * 앱에서는 아래 길로 가지 않는다.
     *
     * 아래는 화면을 통째로 카카오로 옮기는 방식인데, 앱에서 그러면 웹뷰가
     * 웹사이트를 열어버려 **앱이 사이트로 바뀐다.** 앱은 시스템 브라우저를
     * 띄우고 앱 전용 주소로 돌아온다(src/auth/kakaoNative.ts).
     */
    const { isApp, signInWithKakaoApp } = await import('./kakaoNative')
    if (isApp()) return signInWithKakaoApp()

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

      /*
       * 여기서 **끝내지 않는다.**
       *
       * 카카오 로그인은 팝업이 아니라 이 페이지를 통째로 옮긴다. 예전에는
       * authorize() 를 부른 직후 'cancelled' 를 돌려주고 "화면이 곧 사라지니
       * 괜찮다" 고 적어뒀는데, 그건 이동이 빠른 브라우저에서만 안 보였을 뿐
       * 처음부터 거짓말이었다. 모바일 사파리는 이동이 늦어서 그 사이에 화면이
       * 다시 그려지고, 누른 사람은 "로그인을 취소했습니다" 를 본다.
       *
       * 그래서 답을 미룬다. 이동이 되면 이 약속은 영영 안 끝나고 화면은
       * 그대로 사라진다. 한참 기다려도 여기 있으면 그때는 진짜 막힌 것이다.
       */
      return await new Promise<AuthResult>((resolve) => {
        setTimeout(
          () => resolve({ ok: false, failure: { code: 'redirect-blocked', provider: 'kakao' } }),
          REDIRECT_WAIT_MS,
        )
      })
    } catch (e) {
      return { ok: false, failure: { code: 'failed', provider: 'kakao', detail: String(e) } }
    }
  },

  async signOut() {
    window.Kakao?.Auth.logout()
  },
}
