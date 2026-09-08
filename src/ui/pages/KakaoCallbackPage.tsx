import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import { exchangeKakaoCode } from '../../auth/api'
import { config } from '../../config'
import { usePrefs } from '../PrefsContext'

type State =
  | { phase: 'working' }
  | { phase: 'done'; name: string }
  | { phase: 'error'; message: string }
  /** 앱에서 시작한 로그인이라, 코드를 앱에 넘기고 여기서는 끝낸다. */
  | { phase: 'handoff' }

/** 앱으로 넘기는 주소. src/auth/kakaoNative.ts 와 AndroidManifest 의 값과 같아야 한다. */
const APP_URL = 'kr.whenigo.app://oauth/kakao'

/**
 * 카카오가 인가 코드를 들고 돌아오는 자리.
 * 코드를 서버로 넘기면 서버가 토큰으로 교환하고 세션 쿠키를 내려준다.
 * 액세스 토큰은 브라우저에 오지 않는다.
 */
export function KakaoCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { applyResult } = useAuthContext()
  const { t } = usePrefs()

  const code = params.get('code')
  const oauthError = params.get('error')
  const oauthErrorDescription = params.get('error_description')

  /*
   * 앱에서 시작한 로그인인가.
   *
   * 앱은 시스템 브라우저를 띄워 카카오로 보내는데, 카카오는 **http/https 로만**
   * 돌려보낼 수 있다(커스텀 스킴은 콘솔에 등록조차 안 된다 — KOE006).
   * 그래서 앱도 이 웹 주소로 돌아오고, 여기서 앱으로 넘긴다.
   *
   * 지금 이 화면은 브라우저 안이다. 앱 안이 아니므로 코드를 우리가 쓰지 않고
   * 앱에 건넨다 — 여기서 로그인해봐야 브라우저에만 세션이 생기고 앱은 그대로다.
   */
  const forApp = params.get('state') === 'app'

  const [state, setState] = useState<State>(forApp && code ? { phase: 'handoff' } : { phase: 'working' })
  // 인가 코드는 1회용이라 StrictMode 의 이중 실행으로 두 번 보내면 두 번째가 실패한다
  const sent = useRef(false)

  /*
   * 앱으로 넘긴다. 곧바로 한 번 시도하고, 버튼도 남긴다 —
   * 크롬은 사람이 누르지 않은 커스텀 스킴 이동을 막을 때가 있어서,
   * 자동 시도만 두면 아무 일도 안 일어난 채 화면이 멈춘다.
   */
  const appUrl = `${APP_URL}?code=${encodeURIComponent(code ?? '')}`
  useEffect(() => {
    if (!forApp || !code) return
    window.location.href = appUrl
  }, [forApp, code, appUrl])

  useEffect(() => {
    if (forApp || oauthError || !code || sent.current) return
    sent.current = true

    exchangeKakaoCode(code, config.kakao.redirectUri).then((r) => {
      if (!r.ok) {
        setState({ phase: 'error', message: r.message })
        return
      }
      applyResult({ ok: true, account: r.account })
      setState({ phase: 'done', name: r.account.name ?? r.account.email ?? '' })
      setTimeout(() => navigate('/', { replace: true }), 900)
    })
  }, [code, oauthError, applyResult, navigate, forApp])

  return (
    <div className="login">
      <div className="login__card">
        <Link className="login__back" to="/login">
          {t.callback.backToLogin}
        </Link>
        <p className="login__eyebrow">{t.callback.eyebrow}</p>

        {oauthError && (
          <>
            <h1 className="login__title">{t.callback.cancelled}</h1>
            <p className="login__error" role="alert">
              {oauthErrorDescription ?? oauthError}
            </p>
          </>
        )}

        {!oauthError && !code && (
          <>
            <h1 className="login__title">{t.callback.invalid}</h1>
            <p className="login__sub">{t.callback.invalidBody}</p>
          </>
        )}

        {state.phase === 'handoff' && (
          <>
            <h1 className="login__title">{t.callback.backToApp}</h1>
            <p className="login__sub">{t.callback.backToAppBody}</p>
            <a className="login__fallback" href={appUrl}>
              {t.callback.backToAppAction}
            </a>
          </>
        )}

        {!oauthError && code && state.phase === 'working' && (
          <>
            <h1 className="login__title">{t.callback.working}</h1>
            <p className="login__sub">{t.callback.workingBody}</p>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <h1 className="login__title">{t.callback.done}</h1>
            <p className="login__sub">{t.callback.doneBody(state.name)}</p>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <h1 className="login__title">{t.callback.failed}</h1>
            <p className="login__error" role="alert">
              {state.message}
            </p>
            <Link className="login__fallback" to="/login">
              {t.callback.retry}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
