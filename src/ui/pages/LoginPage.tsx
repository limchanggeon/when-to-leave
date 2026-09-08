import { useEffect, useRef, useState } from 'react'
import { usePageMeta } from '../usePageMeta'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import { mountGoogleButton } from '../../auth/google'
import { googleAuth, kakaoAuth } from '../../auth/providers'
import type { AuthFailure } from '../../auth/types'
import { KakaoLoginButton } from '../components/KakaoLoginButton'
import { EmailAuthForm } from '../components/EmailAuthForm'
import { usePrefs } from '../PrefsContext'
import type { I18nShape } from '../../i18n'

function failureText(f: AuthFailure, t: I18nShape): string {
  switch (f.code) {
    case 'not-configured':
      return t.login.err.notConfigured(f.envVar)
    case 'cancelled':
      return t.login.err.cancelled
    case 'redirect-blocked':
      return t.login.err.redirectBlocked
    case 'sdk-unavailable':
      return t.login.err.sdk
    case 'failed':
      return f.detail ?? t.login.err.failed
  }
}

export function LoginPage() {
  usePageMeta('로그인', '로그인하면 자주 가는 곳과 계산한 여정을 저장하고, 출발 알람을 캘린더에 걸어둘 수 있습니다.')

  const { account, failure, busy, signIn, applyResult } = useAuthContext()
  const { t } = usePrefs()
  const navigate = useNavigate()
  const googleSlot = useRef<HTMLDivElement>(null)
  const [googleRendered, setGoogleRendered] = useState(false)

  // 이미 로그인돼 있으면 머무를 이유가 없다
  useEffect(() => {
    if (account) navigate('/', { replace: true })
  }, [account, navigate])

  // 구글은 공식 버튼을 구글이 직접 렌더한다(브랜딩 규격 자동 준수)
  useEffect(() => {
    const el = googleSlot.current
    if (!el || !googleAuth.configured) return
    let cancelled = false
    mountGoogleButton(el, (r) => {
      if (!cancelled) applyResult(r)
    }).then((res) => {
      if (!cancelled) setGoogleRendered(res.ok)
    })
    return () => {
      cancelled = true
    }
  }, [applyResult])

  return (
    <div className="login">

      <div className="login__card">
        <Link className="login__back" to="/">
          {t.login.back}
        </Link>

        <p className="login__eyebrow">{t.login.eyebrow}</p>
        <h1 className="login__title">{t.app.title}</h1>
        <p className="login__sub">
          {t.login.sub.map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </p>

        <EmailAuthForm t={t} />

        <div className="login__divider">
          <span>{t.emailAuth.or}</span>
        </div>

        <div className="login__providers">
          <KakaoLoginButton
            onClick={() => signIn('kakao')}
            disabled={busy !== null}
            label={t.login.kakaoLabel}
          />
          {!kakaoAuth.configured && (
            <p className="login__note">{t.login.notConfigured('VITE_KAKAO_JS_KEY')}</p>
          )}

          {/* 구글이 렌더한 공식 버튼이 여기 들어간다 */}
          <div className="login__google" ref={googleSlot} />
          {!googleRendered && (
            <button
              className="login__fallback"
              type="button"
              onClick={() => signIn('google')}
              disabled={busy !== null}
            >
              {t.login.googleFallback}
            </button>
          )}
          {!googleAuth.configured && (
            <p className="login__note">{t.login.notConfigured('VITE_GOOGLE_CLIENT_ID')}</p>
          )}
        </div>

        {failure && (
          <p className="login__error" role="alert">
            {failureText(failure, t)}
          </p>
        )}

        <p className="login__terms">{t.login.terms}</p>
      </div>
    </div>
  )
}
