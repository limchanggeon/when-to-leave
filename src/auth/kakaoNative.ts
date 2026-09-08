import { isApp } from '../native/platform'
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
 * 그래서 앱에서는 시스템 브라우저를 따로 띄우고, 카카오가 **앱 전용 주소**로
 * 돌려보내게 한다. 안드로이드가 그 주소를 보고 우리 앱을 깨우면, 브라우저를
 * 닫고 인가 코드만 받아 서버에 넘긴다.
 *
 * 시스템 브라우저를 쓰는 것은 안전 문제이기도 하다. 앱 안 웹뷰에 카카오
 * 비밀번호를 치게 하면 앱이 그걸 훔쳐볼 수 있는 구조가 된다 —
 * 그래서 카카오도 구글도 그 방식을 권하지 않는다.
 *
 * **카카오 콘솔 설정이 하나 필요하다.** [카카오 로그인 > Redirect URI] 에
 * 아래 APP_REDIRECT_URI 를 글자 그대로 더해야 한다. 웹 주소는 그대로 둔다 —
 * 둘 다 등록해두면 웹과 앱이 각자의 주소로 돌아온다.
 */

/** 카카오 콘솔에 등록할 앱 전용 주소. AndroidManifest 의 intent-filter 와 같아야 한다. */
export const APP_REDIRECT_URI = 'kr.whenigo.app://oauth/kakao'

export { isApp }

function authorizeUrl(jsKey: string): string {
  const u = new URL('https://kauth.kakao.com/oauth/authorize')
  u.searchParams.set('client_id', jsKey)
  u.searchParams.set('redirect_uri', APP_REDIRECT_URI)
  u.searchParams.set('response_type', 'code')
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

  // 여기서부터는 웹과 같은 길이다 — 코드를 서버에 넘기면 세션 쿠키가 내려온다
  const r = await exchangeKakaoCode(code, APP_REDIRECT_URI)
  return r.ok
    ? { ok: true, account: r.account }
    : { ok: false, failure: { code: 'failed', provider: 'kakao', detail: r.message } }
}
