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
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
import { searchTransitRoute, type WireRoute } from './odsay'
import { trainsBetween } from './tago'
import {
  expressBusesBetween,
  flightsBetween,
  suburbsBusesBetween,
  subwayDeparturesBetween,
  type Run,
} from './tagoSchedules'
import {
  GOOGLE_HAS_NO_TRANSIT,
  geocodeWorld,
  searchTransitGoogle,
  type WorldPoint,
} from './googleRoutes'

const app = express()
app.use(express.json())

// Caddy 뒤에 선다. 이게 없으면 req.ip 가 늘 프록시 주소로 보인다.
app.set('trust proxy', 1)

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
/**
 * 좌표만 있을 때의 대략적인 나라 판별.
 * 지오코딩을 한 번 더 부르지 않으려고 경계 상자로 가른다 —
 * 두 나라는 겹치지 않으므로 이 정도로 충분하다.
 */
function countryOf(lat: number, lng: number): string | null {
  if (lat >= 33 && lat <= 38.7 && lng >= 124.5 && lng <= 131.9) return 'KR'
  if (lat >= 24 && lat <= 45.6 && lng >= 122.9 && lng <= 146) return 'JP'
  return null
}

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

  /**
   * 지점을 좌표 + 나라로 푼다.
   *
   * 국내는 카카오가 정확하고 빠르다. 못 찾으면 구글로 넘어가는데,
   * 구글은 나라 코드를 주므로 해외인지 오타인지 여기서 갈린다 —
   * 클라이언트가 글자를 보고 추측할 일이 없어진다.
   */
  const resolve = async (
    p: { name?: string; lat?: number; lng?: number } | undefined,
  ): Promise<WorldPoint | { error: { code: string; message: string } }> => {
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
      return {
        name: p.name?.trim() || '지정한 위치',
        lat: p.lat,
        lng: p.lng,
        country: countryOf(p.lat, p.lng),
      }
    }
    const name = p?.name?.trim()
    if (!name) {
      return { error: { code: 'no-data', message: '위치를 알 수 없습니다' } }
    }

    const kr = await geocode(name)
    if (kr.ok) return { ...kr.point, country: 'KR' }
    // 카카오가 지역 미지원으로 잘라낸 경우는 그대로 전한다
    if (kr.code === 'region-unsupported') {
      const world = await geocodeWorld(name)
      if (world.ok) return world.data
      return { error: { code: 'region-unsupported', message: kr.message } }
    }

    const world = await geocodeWorld(name)
    if (world.ok) return world.data
    /*
     * 국내에서 못 찾았고 해외 조회도 실패했다.
     * 해외 조회가 "설정이 안 됐다" 로 실패한 경우에는 그 사실을 알려야 한다 —
     * 카카오의 "찾지 못했습니다" 만 보여주면 오타로 오해한다.
     */
    if (world.code === 'upstream-error' || world.code === 'no-credentials') {
      return { error: { code: 'region-unsupported', message: world.message } }
    }
    return { error: { code: kr.code, message: kr.message } }
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

    /*
     * 나라로 어댑터를 고른다.
     *   국내  ODsay — 구글은 한국에서 길찾기를 제공하지 않는다
     *   일본  구글 Routes
     * 나라가 다르면 항공 구간을 끼워야 하는데 아직 다루지 않는다.
     */
    const pair = `${start.country ?? '?'}-${end.country ?? '?'}`
    if (start.country && end.country && start.country !== end.country) {
      res.status(400).json({
        error: {
          code: 'region-unsupported',
          message: `아직 한 나라 안에서만 계산합니다 (${pair})`,
        },
      })
      return
    }

    const country = start.country ?? end.country ?? 'KR'

    /*
     * 구글이 대중교통을 다루지 않는 나라(일본)는 여기서 멈춘다.
     * 실측으로 확인했다 — Directions·Routes·JS SDK 셋 다 도쿄·오사카에서
     * ZERO_RESULTS 이고 런던·뉴욕은 정상이다.
     * "찾지 못했다" 가 아니라 "이 방법으로는 안 된다" 이므로 그렇게 말한다.
     */
    if (GOOGLE_HAS_NO_TRANSIT.has(country)) {
      res.status(400).json({
        error: {
          code: 'region-unsupported',
          message: `${country} 대중교통 경로는 구글 API 가 제공하지 않습니다 (별도 데이터 소스가 필요합니다)`,
        },
      })
      return
    }

    const route =
      country === 'KR'
        ? await searchTransitRoute(start, end)
        : await (async () => {
            const r = await searchTransitGoogle(start, end)
            return r.ok
              ? ({ ok: true, routes: r.data } as const)
              : ({ ok: false, code: r.code, message: r.message } as const)
          })()

    if (!route.ok) {
      res.status(route.code === 'no-credentials' ? 500 : 502).json({
        error: { code: route.code, message: route.message },
      })
      return
    }
    // 첫 경로가 추천안, 나머지는 대안으로 쓴다
    // 열차 구간에 실제 시각표를 붙인다. ODsay 는 배차 간격만 주므로
    // 이게 없으면 역산이 "몇 분마다 온다" 수준에 머문다.
    const enriched = await withTimetables(route.routes)
    res.json({ routes: enriched, from: start, to: end })
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

/**
 * 열차 구간에 TAGO 시각표를 채워 넣는다.
 *
 * 같은 구간이 여러 경로에 겹쳐 나오므로 한 번만 조회해 나눠 쓴다 —
 * 공공데이터포털은 일일 호출 한도가 있다.
 */
/**
 * ODsay 가 준 구간에 **실제 운행 시각**을 채운다.
 *
 * ODsay 는 소요시간과 평균 배차만 준다. 시각이 붙은 구간만 엔진에서
 * 이산 구간이 되어 "이 편을 타려면 언제까지 도착해야 하는가" 를 앞으로
 * 전파한다 — 이 앱의 알맹이다. 못 채운 구간은 예전처럼 연속 구간으로 남는다.
 *
 * 수단마다 TAGO 서비스가 다르고, 시내버스는 시각표 서비스 자체가 없다.
 */
async function withTimetables(routes: WireRoute[]): Promise<WireRoute[]> {
  const cache = new Map<string, Run[] | null>()
  const now = new Date()

  for (const route of routes) {
    for (const leg of route.legs) {
      if (!leg.tagoKind) continue

      const key = `${leg.tagoKind}:${leg.from.name}>${leg.to.name}`
      if (!cache.has(key)) {
        cache.set(key, await lookupRuns(leg, now))
      }
      const runs = cache.get(key)
      if (!runs?.length) continue

      leg.runs = runs.map((r) => ({
        departAt: r.departAt,
        arriveAt: r.arriveAt,
        carrier: r.carrier,
        fare: r.fare,
      }))
    }
  }
  return routes
}

async function lookupRuns(leg: WireRoute['legs'][number], now: Date): Promise<Run[] | null> {
  const a = leg.from.name
  const b = leg.to.name
  switch (leg.tagoKind) {
    case 'train': {
      const runs = await trainsBetween(a, b, now)
      return (
        runs?.map((r) => ({
          departAt: r.departAt,
          arriveAt: r.arriveAt,
          carrier: [r.grade, r.trainNo].filter(Boolean).join(' ').trim(),
          fare: r.fare,
        })) ?? null
      )
    }
    case 'expressBus':
      return expressBusesBetween(a, b, now)
    case 'suburbsBus':
      return suburbsBusesBetween(a, b, now)
    case 'flight':
      return flightsBetween(a, b, now)
    case 'subway':
      return subwayDeparturesBetween(a, b, now, leg.durationMin)
    default:
      return null
  }
}

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

/*
 * 빌드된 프론트엔드 서빙.
 *
 * 개발 중에는 Vite 가 화면을 띄우고 /api 만 이쪽으로 넘겨주지만,
 * 운영에는 Vite 가 없다. 같은 서버가 화면까지 내보내야
 * 프론트와 API 가 같은 주소를 쓰게 되고, 그래야 CORS 없이
 * 세션 쿠키(sameSite: lax)가 그대로 동작한다.
 *
 * NODE_ENV 가 아니라 dist 존재 여부로 켠다 — 빌드를 안 했는데
 * 켜져서 404 만 뱉는 상황이 더 헷갈리기 때문이다.
 */
const webRoot = resolve(process.cwd(), 'dist')
const hasWeb = existsSync(join(webRoot, 'index.html'))

if (hasWeb) {
  app.use(
    express.static(webRoot, {
      index: false, // 폴백을 아래에서 직접 다룬다
      setHeaders: (res, filePath) => {
        // 해시가 붙은 에셋은 이름이 곧 버전이라 오래 캐시해도 안전하다.
        // index.html 은 매번 확인해야 새 배포가 바로 보인다.
        const immutable = filePath.includes(`${'/'}assets${'/'}`)
        res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }),
  )

  // SPA 폴백. /login, /me 를 새로고침해도 열려야 한다.
  // 라우트가 아닌 미들웨어로 두는 이유: Express 5 는 '*' 경로 문법이 바뀌어
  // app.get('*') 가 그대로는 동작하지 않는다.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    // 없는 API 는 index.html 이 아니라 404 여야 한다.
    if (req.path === '/api' || req.path.startsWith('/api/')) return next()
    // sendFile 기본값은 max-age=0 이라 의도가 흐릿하다. 명시해 둔다.
    res.sendFile(join(webRoot, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } })
  })
}

app.listen(serverEnv.port, () => {
  console.log(`[server] http://localhost:${serverEnv.port}`)
  console.log(hasWeb ? '[server] dist/ 서빙 중' : '[server] dist/ 없음 — API 만 응답합니다')
  const purged = purgeExpiredSessions()
  if (purged > 0) console.log(`[server] 만료 세션 ${purged}건 정리`)
  for (const { name, breaks } of missingServerEnv()) {
    console.log(`[server] ⚠ ${name} 없음 → ${breaks}`)
  }
  if (serverEnv.sessionSecret === 'dev-only-insecure-secret') {
    console.log('[server] ⚠ SESSION_SECRET 이 기본값입니다. 운영 전에 반드시 바꾸세요')
  }
})
