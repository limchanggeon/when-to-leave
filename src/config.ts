/**
 * 외부 서비스 설정. 키는 코드에 박지 않고 .env 로 받는다(.env.example 참조).
 *
 * 키가 없는 것은 오류가 아니라 "아직 연결 안 됨" 상태다.
 * 어댑터 계약과 같은 원칙 — 조용히 실패하지 말고 화면에 그대로 드러낸다.
 */
const env = import.meta.env as Record<string, string | undefined>

const trim = (v: string | undefined) => {
  const s = (v ?? '').trim()
  return s.length > 0 ? s : null
}

/**
 * 카카오 Redirect URI.
 * 콘솔에 등록한 값과 **글자 하나까지 같아야** 한다.
 * 기본값은 현재 접속한 오리진에서 만들어 쓰므로, 로컬이든 배포든
 * "<오리진>/auth/kakao/callback" 만 콘솔에 등록해두면 된다.
 */
function kakaoRedirectUri(): string {
  const explicit = trim(env.VITE_KAKAO_REDIRECT_URI)
  if (explicit) return explicit
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/auth/kakao/callback`
}

export const config = {
  kakao: {
    /** 카카오 JavaScript 키. 지도 SDK 와 카카오 로그인이 함께 쓴다. */
    jsKey: trim(env.VITE_KAKAO_JS_KEY),
    redirectUri: kakaoRedirectUri(),
    /**
     * 추가 동의항목. 비워두는 것이 기본이다 —
     * 콘솔에 켜지 않은 항목을 요청하면 KOE205 로 거부된다.
     */
    scope: trim(env.VITE_KAKAO_SCOPE),
  },
  google: {
    /** Google Maps JavaScript API 키 (해외 구간 지도). */
    mapsKey: trim(env.VITE_GOOGLE_MAPS_KEY),
    /** Google Identity Services 클라이언트 ID (구글 로그인). */
    clientId: trim(env.VITE_GOOGLE_CLIENT_ID),
  },
} as const

export type MissingConfig = { service: string; envVar: string; docsUrl: string }

/** 어떤 키가 비어 있는지 화면에 안내하기 위한 목록. */
export function missingConfig(): MissingConfig[] {
  const out: MissingConfig[] = []
  if (!config.kakao.jsKey)
    out.push({
      service: '카카오 지도 · 카카오 로그인',
      envVar: 'VITE_KAKAO_JS_KEY',
      docsUrl: 'https://developers.kakao.com/console/app',
    })
  if (!config.google.mapsKey)
    out.push({
      service: '구글 지도 (해외 구간)',
      envVar: 'VITE_GOOGLE_MAPS_KEY',
      docsUrl: 'https://console.cloud.google.com/google/maps-apis',
    })
  if (!config.google.clientId)
    out.push({
      service: '구글 로그인',
      envVar: 'VITE_GOOGLE_CLIENT_ID',
      docsUrl: 'https://console.cloud.google.com/apis/credentials',
    })
  return out
}
