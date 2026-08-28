import { createPublicKey, createVerify } from 'node:crypto'
import { fetchJson } from './http'
import { serverEnv } from './env'
import { upsertSocialUser, type User } from './users'

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])

interface Jwk {
  kid: string
  kty: string
  alg?: string
  use?: string
  n: string
  e: string
}

/**
 * 구글 공개키. 주기적으로 교체되므로 캐시하되 오래 붙들지 않는다.
 * 모르는 kid 가 오면 캐시를 무시하고 다시 받는다(키 교체 직후 상황).
 */
let jwksCache: { at: number; keys: Jwk[] } | null = null
const JWKS_TTL_MS = 60 * 60_000

async function getKeys(forceRefresh = false): Promise<Jwk[] | null> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const res = await fetchJson<{ keys: Jwk[] }>(JWKS_URL, {}, { label: '구글 공개키' })
  if (!res.ok) return jwksCache?.keys ?? null
  jwksCache = { at: Date.now(), keys: res.data.keys }
  return jwksCache.keys
}

const fromBase64Url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

interface IdTokenPayload {
  iss: string
  aud: string
  sub: string
  exp: number
  iat: number
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

export type GoogleVerifyResult =
  | { ok: true; user: User }
  | { ok: false; code: string; message: string }

/**
 * 구글 ID 토큰 검증.
 *
 * 예전에는 브라우저에서 payload 만 디코딩해 썼다 — 서명을 보지 않으므로
 * 아무나 sub/email 을 지어낸 토큰으로 로그인할 수 있었다.
 * 여기서 서명·발급자·대상·만료를 모두 확인한다.
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleVerifyResult> {
  const clientId = serverEnv.googleClientId
  if (!clientId) {
    return { ok: false, code: 'not-configured', message: 'GOOGLE_CLIENT_ID 가 서버에 없습니다' }
  }

  const parts = credential.split('.')
  if (parts.length !== 3) {
    return { ok: false, code: 'malformed', message: '토큰 형식이 올바르지 않습니다' }
  }
  const [headerB64, payloadB64, signatureB64] = parts

  let header: { alg?: string; kid?: string }
  let payload: IdTokenPayload
  try {
    header = JSON.parse(fromBase64Url(headerB64).toString('utf8'))
    payload = JSON.parse(fromBase64Url(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, code: 'malformed', message: '토큰을 읽지 못했습니다' }
  }

  // 알고리즘을 고정한다. 토큰이 스스로 알고리즘을 정하게 두면
  // alg:none 이나 대칭키로 바꿔치기하는 공격이 가능하다.
  if (header.alg !== 'RS256') {
    return { ok: false, code: 'bad-alg', message: '지원하지 않는 서명 알고리즘입니다' }
  }

  let keys = await getKeys()
  let jwk = keys?.find((k) => k.kid === header.kid)
  if (!jwk) {
    // 키가 막 교체됐을 수 있다. 한 번만 다시 받아본다.
    keys = await getKeys(true)
    jwk = keys?.find((k) => k.kid === header.kid)
  }
  if (!jwk) {
    return { ok: false, code: 'unknown-key', message: '서명 키를 찾지 못했습니다' }
  }

  // JWK 를 그대로 공개키로 들여온다(n, e 만 있으면 된다)
  const publicKey = createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: 'jwk',
  })
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  if (!verifier.verify(publicKey, fromBase64Url(signatureB64))) {
    return { ok: false, code: 'bad-signature', message: '토큰 서명이 올바르지 않습니다' }
  }

  if (!VALID_ISSUERS.has(payload.iss)) {
    return { ok: false, code: 'bad-issuer', message: '발급자가 구글이 아닙니다' }
  }
  // 대상 확인이 없으면 다른 서비스용으로 발급된 토큰을 그대로 쓸 수 있다
  if (payload.aud !== clientId) {
    return { ok: false, code: 'bad-audience', message: '이 앱을 위해 발급된 토큰이 아닙니다' }
  }
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) {
    return { ok: false, code: 'expired', message: '토큰이 만료됐습니다' }
  }

  return {
    ok: true,
    user: upsertSocialUser({
      provider: 'google',
      providerUserId: payload.sub,
      // 확인되지 않은 이메일로 기존 계정에 붙이면 계정 탈취가 된다
      email: payload.email_verified ? (payload.email ?? null) : null,
      name: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
    }),
  }
}
