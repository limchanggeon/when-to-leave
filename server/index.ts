import express from 'express'
import { serverEnv, missingServerEnv } from './env'
import { exchangeKakaoCode } from './kakao'
import { COOKIE_NAME, cookieOptions, createSession, destroySession, readSession } from './session'
import { geocode, type GeoPoint } from './geocode'
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
    const token = createSession(result.user)
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
          message: `출발지를 정하지 못했습니다 — ${start.error.message}. 현재 위치를 허용하거나 출발지를 직접 입력해 주세요.`,
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

app.post('/api/auth/logout', (req, res) => {
  destroySession(cookie(req, COOKIE_NAME))
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined })
  res.json({ ok: true })
})

app.listen(serverEnv.port, () => {
  console.log(`[server] http://localhost:${serverEnv.port}`)
  for (const { name, breaks } of missingServerEnv()) {
    console.log(`[server] ⚠ ${name} 없음 → ${breaks}`)
  }
  if (serverEnv.sessionSecret === 'dev-only-insecure-secret') {
    console.log('[server] ⚠ SESSION_SECRET 이 기본값입니다. 운영 전에 반드시 바꾸세요')
  }
})
