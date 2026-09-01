import { db } from './db/index'
import { serverEnv } from './env'
import { fetchJson } from './http'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/** 일정 쓰기에 필요한 최소 범위. 읽기까지 요구하지 않는다. */
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export type CalendarError = { code: string; message: string }
export type CalendarResult<T> = { ok: true; data: T } | { ok: false; error: CalendarError }

const missingConfig = (): CalendarError | null => {
  if (!serverEnv.googleClientId) {
    return { code: 'not-configured', message: 'GOOGLE_CLIENT_ID 가 없습니다' }
  }
  if (!serverEnv.googleClientSecret) {
    return { code: 'not-configured', message: 'GOOGLE_CLIENT_SECRET 이 없습니다' }
  }
  return null
}

/**
 * 동의 화면 주소.
 *
 * access_type=offline + prompt=consent 여야 refresh_token 이 온다.
 * 이게 없으면 액세스 토큰이 한 시간 뒤 만료된 뒤 다시 동의를 받아야 한다.
 */
export function consentUrl(state: string): CalendarResult<string> {
  const problem = missingConfig()
  if (problem) return { ok: false, error: problem }

  const params = new URLSearchParams({
    client_id: serverEnv.googleClientId!,
    redirect_uri: serverEnv.googleRedirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return { ok: true, data: `${AUTH_URL}?${params}` }
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

function storeTokens(userId: string, t: TokenResponse): void {
  const expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000
  // refresh_token 은 최초 동의 때만 온다. 갱신 응답에는 없으므로 기존 값을 지키다.
  db()
    .prepare(
      `INSERT INTO google_tokens (user_id, access_token, refresh_token, expires_at, scope, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         access_token  = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
         expires_at    = excluded.expires_at,
         scope         = excluded.scope,
         updated_at    = excluded.updated_at`,
    )
    .run(userId, t.access_token!, t.refresh_token ?? null, expiresAt, t.scope ?? SCOPE, Date.now())
}

export async function exchangeCode(userId: string, code: string): Promise<CalendarResult<true>> {
  const problem = missingConfig()
  if (problem) return { ok: false, error: problem }

  const res = await fetchJson<TokenResponse>(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: serverEnv.googleClientId!,
        client_secret: serverEnv.googleClientSecret!,
        redirect_uri: serverEnv.googleRedirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    },
    { label: '구글 토큰 교환' },
  )
  if (!res.ok) return { ok: false, error: { code: 'network', message: res.message } }
  if (!res.data.access_token) {
    return {
      ok: false,
      error: { code: res.data.error ?? 'exchange-failed', message: res.data.error_description ?? '토큰 교환 실패' },
    }
  }

  storeTokens(userId, res.data)
  return { ok: true, data: true }
}

export function isConnected(userId: string): boolean {
  return Boolean(db().prepare('SELECT 1 FROM google_tokens WHERE user_id = ?').get(userId))
}

export function disconnect(userId: string): void {
  db().prepare('DELETE FROM google_tokens WHERE user_id = ?').run(userId)
}

/** 유효한 액세스 토큰. 만료가 가까우면 refresh_token 으로 갱신한다. */
async function accessToken(userId: string): Promise<CalendarResult<string>> {
  const row = db()
    .prepare('SELECT access_token, refresh_token, expires_at FROM google_tokens WHERE user_id = ?')
    .get(userId) as { access_token: string; refresh_token: string | null; expires_at: number } | undefined

  if (!row) {
    return { ok: false, error: { code: 'not-connected', message: '캘린더가 연결돼 있지 않습니다' } }
  }
  // 만료 1분 전이면 미리 갱신한다 — 요청 도중 만료되는 것을 피한다.
  if (row.expires_at - 60_000 > Date.now()) return { ok: true, data: row.access_token }

  if (!row.refresh_token) {
    disconnect(userId)
    return { ok: false, error: { code: 'reconnect-needed', message: '캘린더를 다시 연결해 주세요' } }
  }

  const res = await fetchJson<TokenResponse>(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: row.refresh_token,
        client_id: serverEnv.googleClientId!,
        client_secret: serverEnv.googleClientSecret!,
        grant_type: 'refresh_token',
      }).toString(),
    },
    { label: '구글 토큰 갱신' },
  )
  if (!res.ok || !res.data.access_token) {
    /*
     * refresh token 이 죽었다. 앱이 "테스트" 상태면 구글이 7일 뒤 자동으로
     * 만료시키므로 드문 일이 아니다.
     *
     * 죽은 토큰을 남겨두면 마이페이지가 계속 "연결됨" 이라고 말하게 된다.
     * 지워서 상태가 사실과 맞도록 한다 — 그러면 화면이 다시 연결 버튼을 낸다.
     */
    disconnect(userId)
    return {
      ok: false,
      error: {
        code: 'reconnect-needed',
        message: '캘린더 연결이 만료됐습니다. 다시 연결해 주세요',
      },
    }
  }

  storeTokens(userId, res.data)
  return { ok: true, data: res.data.access_token }
}

export interface EventInput {
  summary: string
  description: string
  startAt: Date
  endAt: Date
  location?: string
  /** 몇 분 전에 알릴지. 여러 개 줄 수 있다. */
  reminderMinutes: number[]
}

export async function insertEvent(
  userId: string,
  input: EventInput,
): Promise<CalendarResult<{ id: string; htmlLink: string }>> {
  const token = await accessToken(userId)
  if (!token.ok) return token

  const res = await fetchJson<{ id?: string; htmlLink?: string; error?: { message?: string } }>(
    EVENTS_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: { dateTime: input.startAt.toISOString() },
        end: { dateTime: input.endAt.toISOString() },
        reminders: {
          useDefault: false,
          overrides: input.reminderMinutes.map((minutes) => ({ method: 'popup', minutes })),
        },
      }),
    },
    { label: '구글 캘린더' },
  )

  if (!res.ok) return { ok: false, error: { code: 'network', message: res.message } }
  if (!res.data.id) {
    return { ok: false, error: { code: 'insert-failed', message: res.data.error?.message ?? '일정을 만들지 못했습니다' } }
  }
  return { ok: true, data: { id: res.data.id, htmlLink: res.data.htmlLink ?? '' } }
}
