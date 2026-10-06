import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'

const temp = mkdtempSync(join(tmpdir(), 'whenigo-smoke-'))
const socket = createServer()
await new Promise<void>((done) => socket.listen(0, '127.0.0.1', done))
const address = socket.address()
assert(address && typeof address !== 'string')
const port = address.port
await new Promise<void>((done) => socket.close(() => done()))
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: {
    ...process.env, PORT: String(port), DB_PATH: join(temp, 'app.db'), NODE_ENV: 'test',
    KAKAO_REST_API_KEY: '', TAGO_SERVICE_KEY: '', GOOGLE_MAPS_SERVER_KEY: '', VITE_GOOGLE_MAPS_KEY: '',
    GOOGLE_CLIENT_ID: '', VITE_GOOGLE_CLIENT_ID: '', MAIL_TRANSPORT: 'console',
    AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', SESSION_SECRET: 'smoke-only-secret',
  }, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
child.stdout.on('data', (data) => { log = (log + data).slice(-4000) })
child.stderr.on('data', (data) => { log = (log + data).slice(-4000) })
const request = (path: string, init?: RequestInit) => fetch(origin + path, { ...init, signal: AbortSignal.timeout(3000) })
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { ready = (await request('/api/health')).ok } catch { /* 기동 대기 */ }
    if (ready) break
    if (child.exitCode !== null) throw new Error(log)
    await new Promise((done) => setTimeout(done, 50))
  }
  assert(ready, log)
  let checked = 0
  for (const path of ['/', '/login', '/me', '/privacy', '/admin', '/settings', '/robots.txt', '/sitemap.xml']) {
    assert.equal((await request(path)).status, 200, path); checked++
  }
  for (const path of ['/.env', '/.git/config', '/server/index.ts', '/data/app.db', '/api/missing', '/missing.js']) {
    assert.equal((await request(path)).status, 404, path); checked++
  }
  const me = await request('/api/auth/me', { headers: { Cookie: 'wtl_session=%E0%A4%A' } })
  assert.equal(me.status, 200)
  assert.equal((await me.json()).account, null); checked++
  for (const body of [{ email: 123 }, { password: [] }, { from: { name: {} } }]) {
    const response = await request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'bad-request'); checked++
  }
  for (const [body, status] of [['{', 400], [JSON.stringify({ value: 'x'.repeat(20000) }), 413]] as const) {
    const response = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    assert.equal(response.status, status)
    assert(response.headers.get('content-type')?.includes('application/json')); checked++
  }
  const releases = await (await request('/api/app/releases')).json()
  assert(releases.android.length > 0)
  assert(releases.android.every((r: { published?: boolean }) => r.published !== false)); checked++
  assert.equal((await request('/api/me')).status, 401); checked++
  // 실제 사용자 대신 임시 관리자/세션으로 권한 변경의 조기 검사를 확인한다.
  const db = new DatabaseSync(join(temp, 'app.db'))
  const now = Date.now()
  db.prepare('INSERT INTO users (id, email, created_at, is_admin, email_verified_at) VALUES (?, ?, ?, 1, ?)')
    .run('smoke-admin', 'admin@example.test', now, now)
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run('smoke-session', 'smoke-admin', now, now + 60_000)
  db.close()
  const signature = createHmac('sha256', 'smoke-only-secret').update('smoke-session').digest('hex')
  const session = `wtl_session=smoke-session.${signature}`
  for (const body of [{}, { on: null }, { on: false }]) {
    const response = await request('/api/admin/users/smoke-admin/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: session }, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400); checked++
  }
  const admin = await request('/api/auth/me', { headers: { Cookie: session } })
  const account = await admin.json() as { account: { isAdmin: boolean } }
  assert.equal(account.account.isAdmin, true); checked++
  console.log(`[smoke] ${checked}개 HTTP 확인 통과 (임시 DB, 외부 API/메일 호출 없음)`)
} finally {
  const exited = new Promise<void>((done) => child.once('exit', () => done()))
  if (child.exitCode === null) { child.kill('SIGTERM'); await exited }
  rmSync(temp, { recursive: true, force: true })
}
