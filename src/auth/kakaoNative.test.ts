import { describe, expect, it, vi, afterEach } from 'vitest'

/*
 * 앱 로그인이 돌아오는 주소.
 *
 * 여기가 틀리면 카카오가 KOE006 으로 막는다 — 실제로 두 번 틀렸다.
 *   1) kr.whenigo.app://oauth/kakao — 커스텀 스킴은 콘솔에 등록조차 안 된다
 *   2) https://app.whenigo… — 앱 화면의 가짜 출처. 존재하지도 않는 도메인이다
 * 둘 다 화면에서는 멀쩡히 카카오 로그인창이 뜨고, 로그인을 끝낸 다음에야 막힌다.
 */
afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

describe('앱 카카오 로그인 주소', () => {
  it('앱 화면의 출처가 아니라 서버 주소로 만든다', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://whenigo.example')
    const { webRedirectUri } = await import('./kakaoNative')
    expect(webRedirectUri()).toBe('https://whenigo.example/auth/kakao/callback')
  })

  it('커스텀 스킴을 카카오에 보내지 않는다 — 등록이 안 되는 형식이다', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://whenigo.example')
    const { webRedirectUri, APP_REDIRECT_URI } = await import('./kakaoNative')
    expect(webRedirectUri()).toMatch(/^https:\/\//)
    // 커스텀 스킴은 웹 콜백이 앱으로 넘길 때만 쓴다
    expect(APP_REDIRECT_URI).toBe('kr.whenigo.app://oauth/kakao')
  })
})
