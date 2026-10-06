import express from 'express'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { guardBody } from './requestGuard'
let server: Server
let origin: string
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use(guardBody)
  app.post('/', (_req, res) => res.json({ ok: true }))
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((done) => server.once('listening', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing address')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(() => new Promise<void>((done) => server.close(() => done())))
it.each([
  { email: 123 }, { password: [] }, { from: { name: {} } }, { to: { lat: 91 } },
  { on: 'false' }, { reminderMinutes: [Infinity] }, { startAt: 'invalid', endAt: 'also invalid' },
])('잘못된 입력을 서버 오류로 넘기지 않는다: %j', async (body) => {
  const response = await fetch(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  expect(response.status).toBe(400)
  const data = await response.json() as { error: { code: string } }
  expect(data.error.code).toBe('bad-request')
})
it('정상 좌표와 빈 본문 요청을 허용한다', async () => {
  expect((await fetch(origin, { method: 'POST' })).status).toBe(200)
  expect((await fetch(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: { name: '출발', lat: 36.3, lng: 127.3 }, to: { name: '도착' } }) })).status).toBe(200)
})
