import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import { exchangeKakaoCode } from '../../auth/api'
import { config } from '../../config'

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
      <div className="login__stars" aria-hidden="true" />
      <div className="login__card">
        <Link className="login__back" to="/login">
          ← 로그인으로
        </Link>
        <p className="login__eyebrow">카카오 로그인</p>

        {oauthError && (
          <>
            <h1 className="login__title">로그인이 취소됐습니다</h1>
            <p className="login__error" role="alert">
              {oauthErrorDescription ?? oauthError}
            </p>
          </>
        )}

        {!oauthError && !code && (
          <>
            <h1 className="login__title">잘못된 접근입니다</h1>
            <p className="login__sub">인가 코드가 없습니다. 로그인부터 다시 시도해 주세요.</p>
          </>
        )}

        {!oauthError && code && state.phase === 'working' && (
          <>
            <h1 className="login__title">로그인 중…</h1>
            <p className="login__sub">서버가 인가 코드를 토큰으로 바꾸고 있습니다.</p>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <h1 className="login__title">환영합니다</h1>
            <p className="login__sub">{state.name ? `${state.name}님, ` : ''}잠시 후 홈으로 이동합니다.</p>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <h1 className="login__title">로그인하지 못했습니다</h1>
            <p className="login__error" role="alert">
              {state.message}
            </p>
            <Link className="login__fallback" to="/login">
              다시 시도
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
