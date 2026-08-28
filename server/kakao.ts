import { serverEnv } from './env'
import { upsertSocialUser, type User } from './users'

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
const ME_URL = 'https://kapi.kakao.com/v2/user/me'

export type ExchangeResult =
  | { ok: true; user: User }
  | { ok: false; status: number; code: string; message: string }

/**
 * 인가 코드를 액세스 토큰으로 바꾸고 사용자 정보를 가져온다.
 * 이 요청에 client_secret 이 들어가기 때문에 반드시 서버에서만 해야 한다.
 */
export async function exchangeKakaoCode(
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  if (!serverEnv.kakaoRestKey) {
    return {
      ok: false,
      status: 500,
      code: 'not-configured',
      message: 'KAKAO_REST_API_KEY 가 서버 환경변수에 없습니다',
    }
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: serverEnv.kakaoRestKey,
    redirect_uri: redirectUri,
    code,
  })
  // 콘솔에서 client_secret 을 켰다면 보내야 하고, 껐다면 보내면 안 된다
  if (serverEnv.kakaoClientSecret) body.set('client_secret', serverEnv.kakaoClientSecret)

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  })
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    error?: string
    error_description?: string
    error_code?: string
  }

  if (!tokenRes.ok || !tokenJson.access_token) {
    return {
      ok: false,
      status: tokenRes.status,
      code: tokenJson.error_code ?? tokenJson.error ?? 'token-exchange-failed',
      // 인가 코드는 1회용이라 새로고침하면 이 오류가 난다 — 흔한 상황이므로 그대로 전달
      message: tokenJson.error_description ?? '토큰 교환에 실패했습니다',
    }
  }

  const meRes = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  if (!meRes.ok) {
    return {
      ok: false,
      status: meRes.status,
      code: 'profile-failed',
      message: '사용자 정보를 가져오지 못했습니다',
    }
  }

  const me = (await meRes.json()) as {
    id: number
    kakao_account?: {
      email?: string
      profile?: { nickname?: string; profile_image_url?: string }
    }
  }

  // 사용자를 만들거나 기존 계정에 이 카카오 계정을 연결한다
  return {
    ok: true,
    user: upsertSocialUser({
      provider: 'kakao',
      providerUserId: String(me.id),
      email: me.kakao_account?.email ?? null,
      name: me.kakao_account?.profile?.nickname ?? null,
      avatarUrl: me.kakao_account?.profile?.profile_image_url ?? null,
    }),
  }
}
