import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import { mountGoogleButton } from '../../auth/google'
import { googleAuth, kakaoAuth } from '../../auth/providers'
import type { AuthFailure } from '../../auth/types'
import { KakaoLoginButton } from '../components/KakaoLoginButton'

function failureText(f: AuthFailure): string {
  switch (f.code) {
    case 'not-configured':
      return `${f.envVar} 가 .env 에 없습니다. 키를 넣고 서버를 다시 시작하면 동작합니다.`
    case 'cancelled':
      return '로그인을 취소했습니다.'
    case 'sdk-unavailable':
      return 'SDK를 불러오지 못했습니다. 네트워크 또는 콘솔의 도메인 등록을 확인하세요.'
    case 'failed':
      return f.detail ?? '로그인에 실패했습니다.'
  }
}

export function LoginPage() {
  const { account, failure, busy, signIn, applyResult } = useAuthContext()
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
      <div className="login__stars" aria-hidden="true" />

      <div className="login__card">
        <Link className="login__back" to="/">
          ← 돌아가기
        </Link>

        <p className="login__eyebrow">출발 시각 역산</p>
        <h1 className="login__title">언제 나가야 하나</h1>
        <p className="login__sub">
          로그인하면 자주 가는 곳과 계산한 여정을 저장하고,
          <br />
          출발 알람을 캘린더에 걸어둘 수 있습니다.
        </p>

        <div className="login__providers">
          <KakaoLoginButton onClick={() => signIn('kakao')} disabled={busy !== null} />
          {!kakaoAuth.configured && (
            <p className="login__note">VITE_KAKAO_JS_KEY 미설정 — 눌러보면 안내가 표시됩니다</p>
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
              Google로 계속하기
            </button>
          )}
          {!googleAuth.configured && (
            <p className="login__note">VITE_GOOGLE_CLIENT_ID 미설정 — 눌러보면 안내가 표시됩니다</p>
          )}
        </div>

        {failure && (
          <p className="login__error" role="alert">
            {failureText(failure)}
          </p>
        )}

        <p className="login__terms">
          로그인하면 서비스 이용약관과 개인정보 처리방침에 동의하는 것으로 봅니다.
        </p>
      </div>
    </div>
  )
}
