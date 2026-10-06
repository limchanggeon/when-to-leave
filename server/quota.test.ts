import './timezone'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const temp = mkdtempSync(join(tmpdir(), 'whenigo-quota-'))
process.env.DB_PATH = join(temp, 'app.db')
const { db, closeDb } = await import('./db/index')
const { quotaOf, reserveSearch } = await import('./quota')
beforeEach(() => {
  vi.useRealTimers()
  db().prepare('DELETE FROM users').run()
  db().prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('test', 'test@example.test', Date.now())
})
afterAll(() => { vi.useRealTimers(); closeDb(); rmSync(temp, { recursive: true }) })

it('20개 동시 검색에서도 무료 한도 3개만 예약하고 실패는 해제한다', () => {
  const attempts = Array.from({ length: 20 }, () => reserveSearch('test', 'free'))
  const admitted = attempts.filter((r) => r.ok)
  expect(admitted).toHaveLength(3)
  admitted[0].finish(false)
  const retry = reserveSearch('test', 'free')
  expect(retry.ok).toBe(true)
  if (retry.ok) { retry.finish(true); retry.finish(true) }
  admitted.slice(1).forEach((r) => r.finish(true))
  expect(quotaOf('test', 'free').used).toBe(3)
  expect(reserveSearch('test', 'free').ok).toBe(false)
})

it('자정을 넘겨 완료해도 다음 날 한도를 차감하지 않는다', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-06T23:59:59+09:00'))
  const request = reserveSearch('test', 'free')
  vi.setSystemTime(new Date('2026-10-07T00:00:01+09:00'))
  if (request.ok) request.finish(true)
  expect(quotaOf('test', 'free').used).toBe(0)
})
