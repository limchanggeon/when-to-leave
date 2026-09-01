import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import { exchangeKakaoCode } from '../../auth/api'
import { config } from '../../config'
import { dictionaries } from '../../i18n'
import { usePrefs } from '../PrefsContext'

type State =
  | { phase: 'working' }
  | { phase: 'done'; name: string }
  | { phase: 'error'; message: string }

/**
 * 카카오가 인가 코드를 들고 돌아오는 자리.
 * 코드를 서버로 넘기면 서버가 토큰으로 교환하고 세션 쿠키를 내려준다.
 * 액세스 토큰은 브라우저에 오지 않는다.
 */
export function KakaoCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { applyResult } = useAuthContext()
  const { lang } = usePrefs()
  const t = dictionaries[lang]

  const code = params.get('code')
  const oauthError = params.get('error')
  const oauthErrorDescription = params.get('error_description')

  const [state, setState] = useState<State>({ phase: 'working' })
  // 인가 코드는 1회용이라 StrictMode 의 이중 실행으로 두 번 보내면 두 번째가 실패한다
  const sent = useRef(false)

  useEffect(() => {
    if (oauthError || !code || sent.current) return
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
  }, [code, oauthError, applyResult, navigate])

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
