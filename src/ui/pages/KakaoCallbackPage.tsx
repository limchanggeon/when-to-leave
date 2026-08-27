import { Link, useSearchParams } from 'react-router-dom'
import { config } from '../../config'

/**
 * 카카오가 인가 코드를 들고 돌아오는 자리.
 *
 * 여기서 토큰을 받으려면 **서버가 필요하다** — 인가 코드를 액세스 토큰으로
 * 바꾸는 요청에는 client_secret 이 들어가고, 그건 브라우저에 둘 수 없다.
 * 서버가 생기기 전까지는 받은 코드를 그대로 보여주고 다음 단계를 안내한다.
 * 서버가 생기면 이 페이지에서 코드를 POST 하고 세션을 받아오면 된다.
 */
export function KakaoCallbackPage() {
  const [params] = useSearchParams()
  const code = params.get('code')
  const error = params.get('error')
  const errorDescription = params.get('error_description')

  return (
    <div className="login">
      <div className="login__stars" aria-hidden="true" />
      <div className="login__card">
        <Link className="login__back" to="/login">
          ← 로그인으로
        </Link>

        <p className="login__eyebrow">카카오 로그인</p>

        {error && (
          <>
            <h1 className="login__title">로그인이 취소됐습니다</h1>
            <p className="login__error" role="alert">
              {errorDescription ?? error}
            </p>
          </>
        )}

        {!error && code && (
          <>
            <h1 className="login__title">인가 코드를 받았습니다</h1>
            <p className="login__sub">
              여기까지는 정상입니다. 다만 이 코드를 액세스 토큰으로 바꾸려면
              <br />
              <strong>서버가 필요합니다</strong> — 토큰 요청에 들어가는 client_secret 은
              <br />
              브라우저에 둘 수 없기 때문입니다.
            </p>
            <code className="callback__code">{code}</code>
            <p className="login__terms">
              서버가 생기면 이 페이지에서 코드를 POST 하고 세션을 받아오도록
              바꾸면 됩니다 (<code>src/ui/pages/KakaoCallbackPage.tsx</code>).
            </p>
          </>
        )}

        {!error && !code && (
          <>
            <h1 className="login__title">잘못된 접근입니다</h1>
            <p className="login__sub">인가 코드가 없습니다. 로그인부터 다시 시도해 주세요.</p>
          </>
        )}

        <p className="login__note">등록된 Redirect URI: {config.kakao.redirectUri}</p>
      </div>
    </div>
  )
}
