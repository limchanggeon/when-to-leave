/**
 * 서버 전용 설정.
 *
 * ⚠ 여기 값들은 **절대 VITE_ 접두사를 붙이면 안 된다.**
 * Vite 는 VITE_ 로 시작하는 변수를 클라이언트 번들에 그대로 박아 넣는다.
 * client_secret 이 브라우저로 새는 순간 서버를 둔 의미가 없어진다.
 */
const req = (name: string): string | null => {
  const v = (process.env[name] ?? '').trim()
  return v.length > 0 ? v : null
}

export const serverEnv = {
  port: Number(process.env.PORT ?? 8787),
  /** 카카오 REST API 키 — JS 키와 다른 값이다. */
  kakaoRestKey: req('KAKAO_REST_API_KEY'),
  /** 콘솔에서 client_secret 을 활성화했다면 필수. */
  kakaoClientSecret: req('KAKAO_CLIENT_SECRET'),
  /** 세션 쿠키 서명용. 운영에서는 반드시 임의의 긴 문자열로 바꿀 것. */
  sessionSecret: req('SESSION_SECRET') ?? 'dev-only-insecure-secret',
  isProd: process.env.NODE_ENV === 'production',
}

export function missingServerEnv(): string[] {
  const out: string[] = []
  if (!serverEnv.kakaoRestKey) out.push('KAKAO_REST_API_KEY')
  return out
}
