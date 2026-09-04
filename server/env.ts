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
  /**
   * 구글 OAuth 클라이언트 ID. ID 토큰의 aud 를 확인하는 데 쓴다.
   * 공개 값이라 클라이언트와 같은 값을 써도 되므로 VITE_ 쪽을 대체로 읽는다.
   */
  googleClientId: req('GOOGLE_CLIENT_ID') ?? req('VITE_GOOGLE_CLIENT_ID'),
  /**
   * 구글 OAuth 클라이언트 시크릿. 캘린더 권한을 받으려면 필요하다.
   * 로그인(ID 토큰 검증)에는 쓰지 않는다 — 그건 공개키로 충분하다.
   */
  googleClientSecret: req('GOOGLE_CLIENT_SECRET'),
  /**
   * 캘린더 동의 후 돌아올 주소. 구글 콘솔의 '승인된 리디렉션 URI' 와 같아야 한다.
   *
   * /api 로 시작해야 한다 — vite 가 /api 만 서버로 프록시하기 때문이다.
   * 다른 경로로 두면 SPA 가 받아버려서 서버가 인가 코드를 보지 못한다.
   */
  googleRedirectUri: req('GOOGLE_REDIRECT_URI') ?? 'http://localhost:4173/api/calendar/callback',
  /**
   * 서버에서 쓰는 구글 지도 키(Routes·Geocoding).
   *
   * 브라우저용 키(VITE_GOOGLE_MAPS_KEY)는 보통 HTTP 리퍼러로 제한돼 있어
   * 서버 호출이 거부된다. 그럴 때를 위해 별도 키를 받는다.
   * 없으면 브라우저 키로 시도해 보고, 거부되면 그 사실을 그대로 알린다.
   */
  googleMapsServerKey: req('GOOGLE_MAPS_SERVER_KEY') ?? req('VITE_GOOGLE_MAPS_KEY'),
  /**
   * 공공데이터포털 TAGO 열차정보. 국내 열차 시각표를 준다.
   * ODsay 는 배차 간격만 주므로, 실제 출발 시각은 여기서 받아 붙인다.
   */
  tagoKey: req('TAGO_SERVICE_KEY'),
  isProd: process.env.NODE_ENV === 'production',
}

/** 없는 환경변수와, 그것이 없으면 무엇이 안 되는지. 로그와 /api/health 가 함께 쓴다. */
export function missingServerEnv(): { name: string; breaks: string }[] {
  const out: { name: string; breaks: string }[] = []
  if (!serverEnv.kakaoRestKey)
    out.push({ name: 'KAKAO_REST_API_KEY', breaks: '카카오 로그인, 장소 검색, 경로 조회 전체' })
  if (!serverEnv.tagoKey)
    out.push({ name: 'TAGO_SERVICE_KEY', breaks: '열차·버스·항공 시각표 — 시외 경로가 나오지 않습니다' })
  return out
}
