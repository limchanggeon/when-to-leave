import express from 'express'
import { serverEnv, missingServerEnv } from './env'
import { exchangeKakaoCode } from './kakao'
import { COOKIE_NAME, cookieOptions, createSession, destroySession, readSession } from './session'

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

app.post('/api/auth/logout', (req, res) => {
  destroySession(cookie(req, COOKIE_NAME))
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined })
  res.json({ ok: true })
})

app.listen(serverEnv.port, () => {
  const missing = missingServerEnv()
  console.log(`[server] http://localhost:${serverEnv.port}`)
  if (missing.length > 0) {
    console.log(`[server] ⚠ 환경변수 없음: ${missing.join(', ')} — 카카오 로그인은 실패합니다`)
  }
  if (serverEnv.sessionSecret === 'dev-only-insecure-secret') {
    console.log('[server] ⚠ SESSION_SECRET 이 기본값입니다. 운영 전에 반드시 바꾸세요')
  }
})
