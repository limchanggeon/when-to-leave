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
    fallbackName: string,
  ): Promise<GeoPoint | { error: { code: string; message: string } }> => {
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
      return { name: p.name || fallbackName, lat: p.lat, lng: p.lng }
    }
    const g = await geocode(p?.name ?? fallbackName)
    return g.ok ? g.point : { error: { code: g.code, message: g.message } }
  }

  try {
    const start = await resolve(from, '현재 위치')
    if ('error' in start) {
      res.status(400).json({ error: start.error })
      return
    }
    const end = await resolve(to, '')
    if ('error' in end) {
      res.status(400).json({ error: end.error })
      return
    }

    const route = await searchTransitRoute(start, end)
    if (!route.ok) {
      res.status(route.code === 'no-credentials' ? 500 : 502).json({
        error: { code: route.code, message: route.message },
      })
      return
    }
    res.json({ legs: route.legs, totalMin: route.totalMin, from: start, to: end })
  } catch (e) {
    res.status(502).json({ error: { code: 'upstream-error', message: String(e) } })
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
