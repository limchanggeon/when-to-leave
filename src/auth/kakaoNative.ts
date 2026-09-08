import { isApp } from '../native/platform'
import { API_BASE } from '../api/base'
import { config } from '../config'
import { exchangeKakaoCode } from './api'
import type { AuthResult } from './types'

/**
 * 앱에서의 카카오 로그인.
 *
 * 웹에서는 화면을 통째로 카카오로 옮겼다가 돌아왔다. 앱에서 같은 짓을 하면
 * **앱이 웹사이트로 바뀐다** — 웹뷰가 whenigo 주소를 열어버리므로, 기기에
 * 담아둔 앱 화면은 사라지고 그때부터는 그냥 사이트를 보는 것이 된다.
 * 돌아올 길도 없다.
 *
 * 그래서 앱에서는 시스템 브라우저를 따로 띄운다. 앱 안 웹뷰에 카카오
 * 비밀번호를 치게 하면 앱이 그걸 훔쳐볼 수 있는 구조가 되므로, 안전 문제이기도
 * 하다 — 카카오도 구글도 그 방식을 권하지 않는다.
 *
 * **돌아오는 길이 문제였다.** 처음에는 카카오가 곧장 앱 주소
 * (kr.whenigo.app://oauth/kakao)로 돌려보내게 했는데, 카카오 Redirect URI 는
 * **http/https 만 받는다.** 커스텀 스킴은 콘솔에 등록조차 안 되고, 등록 없이
 * 쓰면 KOE006("등록되지 않은 리다이렉트")로 막힌다. 실제로 그렇게 막혔다.
 *
 * 그래서 두 걸음으로 돌아온다:
 *   1. 카카오 → 이미 등록된 웹 주소(/auth/kakao/callback). state=app 을 달아 보낸다
 *   2. 그 페이지가 앱으로 넘긴다 — kr.whenigo.app://oauth/kakao?code=…
 *      (src/ui/pages/KakaoCallbackPage.tsx)
 *
 * 콘솔에 더 등록할 것이 없다. 앱이 없는 사람이 같은 주소를 열면 예전처럼
 * 웹에서 로그인이 끝난다.
 */

/** 앱에서 왔다는 표시. 카카오가 그대로 돌려준다. */
export const APP_STATE = 'app'

/** 웹 콜백이 앱으로 넘길 때 쓰는 주소. AndroidManifest 의 intent-filter 와 같아야 한다. */
export const APP_REDIRECT_URI = 'kr.whenigo.app://oauth/kakao'

/**
 * 카카오가 돌아올 주소. **앱의 출처가 아니라 서버 주소로 만든다.**
 *
 * config.kakao.redirectUri 를 그대로 쓰면 안 된다. 그건 지금 화면의 출처에서
 * 만들어지는데, 앱 화면의 출처는 app.<도메인> 이라는 가짜 이름이다
 * (지도 때문에 그렇게 뒀다 — capacitor.config.ts 참고). 실제로 존재하지도
 * 않고 콘솔에 등록돼 있지도 않아서, 그대로 두면 KOE006 이 난다. 실제로 그랬다.
 */
export const webRedirectUri = (): string => `${API_BASE}/auth/kakao/callback`

export { isApp }

function authorizeUrl(jsKey: string): string {
  const u = new URL('https://kauth.kakao.com/oauth/authorize')
  u.searchParams.set('client_id', jsKey)
  // **웹과 같은 주소.** 콘솔에 이미 등록돼 있고, 커스텀 스킴은 등록이 안 된다
  u.searchParams.set('redirect_uri', webRedirectUri())
  u.searchParams.set('response_type', 'code')
  // 그 페이지가 "앱에서 온 로그인" 임을 알아보고 앱으로 넘기는 표시
  u.searchParams.set('state', APP_STATE)
  // scope 는 웹과 같은 이유로 보내지 않는다 — 콘솔에 없는 항목을 요청하면 KOE205
  if (config.kakao.scope) u.searchParams.set('scope', config.kakao.scope)
  return u.toString()
}

/**
 * 브라우저를 띄우고, 인가 코드를 받아 서버와 교환해 세션까지 만든다.
 *
 * 웹의 signIn() 과 달리 **이 함수는 돌아온다.** 화면이 떠나지 않았기 때문이다.
 * 그래서 호출부는 결과를 그 자리에서 받아 쓸 수 있다.
 */
export async function signInWithKakaoApp(): Promise<AuthResult> {
  const jsKey = config.kakao.jsKey
  if (!jsKey) {
    return { ok: false, failure: { code: 'not-configured', provider: 'kakao', envVar: 'VITE_KAKAO_JS_KEY' } }
  }

  const [{ Browser }, { App }] = await Promise.all([
    import('@capacitor/browser'),
    import('@capacitor/app'),
  ])

  const code = await new Promise<string | AuthResult>((resolve) => {
    let settled = false
    const handles: { remove: () => Promise<void> }[] = []
    const finish = async (r: string | AuthResult) => {
      if (settled) return
      settled = true
      for (const h of handles) await h.remove().catch(() => {})
      await Browser.close().catch(() => {})
      resolve(r)
    }

    void App.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(APP_REDIRECT_URI)) return
      const params = new URL(url).searchParams
      const got = params.get('code')
      if (got) void finish(got)
      else {
        const detail = params.get('error_description') ?? params.get('error') ?? undefined
        void finish({ ok: false, failure: { code: 'failed', provider: 'kakao', detail } })
      }
    }).then((h) => handles.push(h))

    /*
     * 사용자가 브라우저를 그냥 닫은 경우. 이걸 안 들으면 프라미스가 영영
     * 안 끝나고 화면이 "확인 중…" 에 갇힌다.
     */
    void Browser.addListener('browserFinished', () => {
      void finish({ ok: false, failure: { code: 'cancelled', provider: 'kakao' } })
    }).then((h) => handles.push(h))

    void Browser.open({ url: authorizeUrl(jsKey) })
  })

  if (typeof code !== 'string') return code

  /*
   * 코드를 서버에 넘기면 세션 쿠키가 내려온다.
   *
   * **여기 redirect_uri 는 카카오에 보냈던 것과 글자까지 같아야 한다.**
   * 카카오가 토큰을 내주기 전에 다시 맞춰보기 때문이다 — 앱 주소를 넣으면
   * 앞에서 통과했더라도 이 단계에서 막힌다.
   */
  const r = await exchangeKakaoCode(code, webRedirectUri())
  return r.ok
    ? { ok: true, account: r.account }
    : { ok: false, failure: { code: 'failed', provider: 'kakao', detail: r.message } }
}
