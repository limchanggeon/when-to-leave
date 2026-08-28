import express from 'express'
import { serverEnv, missingServerEnv } from './env'
import { exchangeKakaoCode } from './kakao'
import { verifyGoogleIdToken } from './googleAuth'
import {
  consentUrl,
  disconnect as disconnectCalendar,
  exchangeCode,
  insertEvent,
  isConnected,
} from './googleCalendar'
import { randomBytes } from 'node:crypto'
import {
  COOKIE_NAME,
  cookieOptions,
  createSession,
  destroySession,
  purgeExpiredSessions,
  readSession,
} from './session'
import { authenticate, registerWithPassword, type User } from './users'
import { checkPassword } from './password'
import { deletePlace, listPlaces, savePlace } from './places'
import {
  accountMeta,
  changePassword,
  deleteAccount,
  listIdentities,
  updateName,
} from './profile'
import { geocode, reverseGeocode, type GeoPoint } from './geocode'
import { searchTransitRoute } from './odsay'

const app = express()
app.use(express.json())

/** 쿠키 파서 — 의존성 하나 줄이려고 직접 읽는다. */
function cookie(req: express.Request, name: string): string | undefined {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

/**
 * 로그인한 사용자를 꺼낸다. 없으면 401 을 보내고 null 을 돌려준다 —
 * 라우트마다 같은 검사를 반복하지 않기 위한 것이다.
 */
function requireUser(req: express.Request, res: express.Response): User | null {
  const user = readSession(cookie(req, COOKIE_NAME))
  if (!user) {
    res.status(401).json({ error: { code: 'unauthorized', message: '로그인이 필요합니다' } })
    return null
  }
  return user
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, missingEnv: missingServerEnv() })
})

/** 현재 로그인 상태. 클라이언트가 새로고침 후 호출한다. */
app.get('/api/auth/me', (req, res) => {
  const user = readSession(cookie(req, COOKIE_NAME))
  res.json({ account: user })
})

/** 카카오 인가 코드 → 세션. 클라이언트는 코드만 넘기고 토큰은 구경도 못 한다. */
app.post('/api/auth/kakao', async (req, res) => {
  const { code, redirectUri } = req.body as { code?: string; redirectUri?: string }
  if (!code || !redirectUri) {
    res.status(400).json({ error: { code: 'bad-request', message: 'code 와 redirectUri 가 필요합니다' } })
    return
  }

  try {
    const result = await exchangeKakaoCode(code, redirectUri)
    if (!result.ok) {
      res.status(result.status >= 400 ? result.status : 400).json({
        error: { code: result.code, message: result.message },
      })
      return
    }
    const token = createSession(result.user.id)
    res.cookie(COOKIE_NAME, token, cookieOptions)
    res.json({ account: result.user })
  } catch (e) {
    res.status(502).json({ error: { code: 'upstream', message: String(e) } })
  }
})

/**
 * 실제 대중교통 경로. 좌표가 있으면 그대로 쓰고, 이름만 있으면 지오코딩한다.
 * ODsay·카카오 키는 서버에만 있으므로 브라우저는 이 엔드포인트만 안다.
 */
app.post('/api/route', async (req, res) => {
  const { from, to } = req.body as {
    from?: { name?: string; lat?: number; lng?: number }
    to?: { name?: string; lat?: number; lng?: number }
  }

  if (!to?.name && (typeof to?.lat !== 'number' || typeof to?.lng !== 'number')) {
    res.status(400).json({ error: { code: 'no-data', message: '도착지가 필요합니다' } })
    return
  }

  const resolve = async (
    p: { name?: string; lat?: number; lng?: number } | undefined,
  ): Promise<GeoPoint | { error: { code: string; message: string } }> => {
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
      return { name: p.name?.trim() || '지정한 위치', lat: p.lat, lng: p.lng }
    }
    const name = p?.name?.trim()
    if (!name) {
      return { error: { code: 'no-data', message: '위치를 알 수 없습니다' } }
    }
    const g = await geocode(name)
    return g.ok ? g.point : { error: { code: g.code, message: g.message } }
  }

  try {
    const start = await resolve(from)
    if ('error' in start) {
      res.status(400).json({
        error: {
          code: start.error.code,
          // 출발지를 못 정하면 왜 못 정했는지 그대로 알려준다.
          // 예전에는 "현재 위치"라는 글자를 그대로 검색해
          // "현재의 공간"(부산진구) 같은 엉뚱한 가게를 출발지로 잡았다.
          message: `출발지를 정하지 못했습니다 — ${start.error.message}. 현재 위치를 허용하거나 실제 장소 이름을 입력해 주세요.`,
        },
      })
      return
    }
    const end = await resolve(to)
    if ('error' in end) {
      res.status(400).json({
        error: { code: end.error.code, message: `도착지를 정하지 못했습니다 — ${end.error.message}` },
      })
      return
    }

    const route = await searchTransitRoute(start, end)
    if (!route.ok) {
      res.status(route.code === 'no-credentials' ? 500 : 502).json({
        error: { code: route.code, message: route.message },
      })
      return
    }
    // 첫 경로가 추천안, 나머지는 대안으로 쓴다
    res.json({ routes: route.routes, from: start, to: end })
  } catch (e) {
    // 여기까지 온 건 예상 못 한 오류다. 원본은 서버 로그에만 남기고
    // 화면에는 사람이 읽을 수 있는 문장을 보낸다.
    console.error('[route] 예상치 못한 오류:', e)
    res.status(500).json({
      error: { code: 'upstream-error', message: '경로를 계산하는 중 서버에서 오류가 났습니다' },
    })
  }
})

/** 좌표 → 지명. 브라우저가 지도 SDK 를 불러오지 않아도 되도록 서버가 대신 한다. */
app.post('/api/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.body as { lat?: number; lng?: number }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: { code: 'no-data', message: '좌표가 필요합니다' } })
    return
  }
  const r = await reverseGeocode(lat, lng)
  if (!r.ok) {
    res.status(r.code === 'no-credentials' ? 500 : 502).json({
      error: { code: r.code, message: r.message },
    })
    return
  }
  res.json({ name: r.name })
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 이메일·비밀번호 회원가입. */
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body as {
    email?: string
    password?: string
    name?: string
  }

  if (!email || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: { code: 'bad-email', message: '이메일 형식이 올바르지 않습니다' } })
    return
  }
  const problem = password ? checkPassword(password) : { code: 'too-short', message: '비밀번호를 입력해 주세요' }
  if (problem) {
    res.status(400).json({ error: { code: problem.code, message: problem.message } })
    return
  }

  const result = await registerWithPassword(email, password!, name ?? null)
  if (!result.ok) {
    res.status(409).json({ error: { code: result.code, message: result.message } })
    return
  }

  res.cookie(COOKIE_NAME, createSession(result.user.id), cookieOptions)
  res.json({ account: result.user })
})

/** 이메일·비밀번호 로그인. */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ error: { code: 'bad-request', message: '이메일과 비밀번호를 입력해 주세요' } })
    return
  }

  const user = await authenticate(email, password)
  if (!user) {
    // 어떤 이메일이 가입돼 있는지 알아낼 수 없도록 사유를 구분하지 않는다
    res.status(401).json({
      error: { code: 'invalid-credentials', message: '이메일 또는 비밀번호가 올바르지 않습니다' },
    })
    return
  }

  res.cookie(COOKIE_NAME, createSession(user.id), cookieOptions)
  res.json({ account: user })
})

/**
 * 구글 로그인. 브라우저가 받은 ID 토큰을 여기서 검증한다.
 * 클라이언트가 payload 만 디코딩해 쓰면 서명을 보지 않는 셈이라
 * 아무나 지어낸 토큰으로 로그인할 수 있다.
 */
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body as { credential?: string }
  if (!credential) {
    res.status(400).json({ error: { code: 'bad-request', message: 'credential 이 필요합니다' } })
    return
  }

  try {
    const r = await verifyGoogleIdToken(credential)
    if (!r.ok) {
      res.status(r.code === 'not-configured' ? 500 : 401).json({
        error: { code: r.code, message: r.message },
      })
      return
    }
    res.cookie(COOKIE_NAME, createSession(r.user.id), cookieOptions)
    res.json({ account: r.user })
  } catch (e) {
    console.error('[google] 검증 중 오류:', e)
    res.status(500).json({ error: { code: 'verify-failed', message: '토큰 검증에 실패했습니다' } })
  }
})

app.post('/api/auth/logout', (req, res) => {
  destroySession(cookie(req, COOKIE_NAME))
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined })
  res.json({ ok: true })
})

/* ---------------- 마이페이지 ---------------- */

/** 계정 요약: 프로필 + 가입일 + 연결된 로그인 수단 + 저장된 장소. */
app.get('/api/me', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({
    account: user,
    meta: accountMeta(user.id),
    identities: listIdentities(user.id),
    places: listPlaces(user.id),
  })
})

app.patch('/api/me', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { name } = req.body as { name?: string }
  if (typeof name !== 'string') {
    res.status(400).json({ error: { code: 'bad-request', message: '이름이 필요합니다' } })
    return
  }
  updateName(user.id, name)
  res.json({ account: { ...user, name: name.trim() || null } })
})

app.post('/api/me/password', async (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { current, next } = req.body as { current?: string; next?: string }

  const problem = next ? checkPassword(next) : { code: 'too-short', message: '새 비밀번호를 입력해 주세요' }
  if (problem) {
    res.status(400).json({ error: { code: problem.code, message: problem.message } })
    return
  }

  const r = await changePassword(user.id, current, next!)
  if (!r.ok) {
    res.status(400).json({ error: { code: r.code, message: r.message } })
    return
  }
  res.json({ ok: true })
})

app.get('/api/me/places', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({ places: listPlaces(user.id) })
})

/** 장소 저장. 좌표가 없으면 이름으로 지오코딩해 채운다. */
app.post('/api/me/places', async (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { label, name, lat, lng } = req.body as {
    label?: string
    name?: string
    lat?: number
    lng?: number
  }
  if (!label?.trim()) {
    res.status(400).json({ error: { code: 'bad-request', message: '이름표가 필요합니다' } })
    return
  }

  let point = { name: name?.trim() ?? '', lat: lat ?? NaN, lng: lng ?? NaN }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    if (!name?.trim()) {
      res.status(400).json({ error: { code: 'bad-request', message: '장소 이름이나 좌표가 필요합니다' } })
      return
    }
    const g = await geocode(name)
    if (!g.ok) {
      res.status(400).json({ error: { code: g.code, message: g.message } })
      return
    }
    point = g.point
  }

  const saved = savePlace(user.id, { label: label.trim(), ...point })
  res.json({ place: saved.ok ? saved.place : null })
})

app.delete('/api/me/places/:id', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const removed = deletePlace(user.id, req.params.id)
  if (!removed) {
    res.status(404).json({ error: { code: 'not-found', message: '장소를 찾지 못했습니다' } })
    return
  }
  res.json({ ok: true })
})

app.delete('/api/me', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  destroySession(cookie(req, COOKIE_NAME))
  deleteAccount(user.id)
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined })
  res.json({ ok: true })
})

/* ---------------- 구글 캘린더 ---------------- */

/**
 * 동의 화면 주소를 만들어 준다.
 *
 * state 는 CSRF 방어용이다. 세션에 묶어 두고 콜백에서 대조해야
 * 남이 만든 code 를 우리 사용자 계정에 붙이는 걸 막을 수 있다.
 */
const pendingStates = new Map<string, { userId: string; at: number }>()
const STATE_TTL_MS = 10 * 60_000

app.get('/api/calendar/status', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({ connected: isConnected(user.id) })
})

app.post('/api/calendar/connect', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return

  // 오래된 state 는 흘려보낸다
  for (const [k, v] of pendingStates) {
    if (Date.now() - v.at > STATE_TTL_MS) pendingStates.delete(k)
  }

  const state = randomBytes(16).toString('hex')
  pendingStates.set(state, { userId: user.id, at: Date.now() })

  const url = consentUrl(state)
  if (!url.ok) {
    res.status(500).json({ error: url.error })
    return
  }
  res.json({ url: url.data })
})

/** 구글이 동의 결과를 들고 돌아오는 자리. */
app.get('/api/calendar/callback', async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string }
  const done = (status: string) => res.redirect(`/me?calendar=${status}`)

  if (error || !code || !state) return done('cancelled')

  const pending = state ? pendingStates.get(state) : undefined
  pendingStates.delete(state)
  if (!pending || Date.now() - pending.at > STATE_TTL_MS) return done('expired')

  // 로그인한 사용자와 동의를 시작한 사용자가 같아야 한다
  const user = readSession(cookie(req, COOKIE_NAME))
  if (!user || user.id !== pending.userId) return done('mismatch')

  const r = await exchangeCode(user.id, code)
  return done(r.ok ? 'connected' : 'failed')
})

app.post('/api/calendar/disconnect', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  disconnectCalendar(user.id)
  res.json({ ok: true })
})

/** 여정을 캘린더 일정으로. 출발 시각에 알림이 걸린다. */
app.post('/api/calendar/events', async (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { summary, description, startAt, endAt, location, reminderMinutes } = req.body as {
    summary?: string
    description?: string
    startAt?: string
    endAt?: string
    location?: string
    reminderMinutes?: number[]
  }

  if (!summary || !startAt || !endAt) {
    res.status(400).json({ error: { code: 'bad-request', message: '제목과 시각이 필요합니다' } })
    return
  }

  const r = await insertEvent(user.id, {
    summary,
    description: description ?? '',
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    location,
    reminderMinutes: reminderMinutes?.length ? reminderMinutes : [15, 5],
  })
  if (!r.ok) {
    res.status(r.error.code === 'not-connected' ? 409 : 502).json({ error: r.error })
    return
  }
  res.json(r.data)
})

app.listen(serverEnv.port, () => {
  console.log(`[server] http://localhost:${serverEnv.port}`)
  const purged = purgeExpiredSessions()
  if (purged > 0) console.log(`[server] 만료 세션 ${purged}건 정리`)
  for (const { name, breaks } of missingServerEnv()) {
    console.log(`[server] ⚠ ${name} 없음 → ${breaks}`)
  }
  if (serverEnv.sessionSecret === 'dev-only-insecure-secret') {
    console.log('[server] ⚠ SESSION_SECRET 이 기본값입니다. 운영 전에 반드시 바꾸세요')
  }
})
