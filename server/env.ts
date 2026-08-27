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
  /** ODsay 대중교통 길찾기. https://lab.odsay.com 에서 발급. */
  odsayKey: req('ODSAY_API_KEY'),
  isProd: process.env.NODE_ENV === 'production',
}

/** 없는 환경변수와, 그것이 없으면 무엇이 안 되는지. 로그와 /api/health 가 함께 쓴다. */
export function missingServerEnv(): { name: string; breaks: string }[] {
  const out: { name: string; breaks: string }[] = []
  if (!serverEnv.kakaoRestKey)
    out.push({ name: 'KAKAO_REST_API_KEY', breaks: '카카오 로그인, 장소 검색' })
  if (!serverEnv.odsayKey)
    out.push({ name: 'ODSAY_API_KEY', breaks: '경로 조회 전체 — 이 키가 없으면 경로가 나오지 않습니다' })
  return out
}
