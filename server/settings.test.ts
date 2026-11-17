import { afterAll, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const temp = mkdtempSync(join(tmpdir(), 'whenigo-settings-'))
process.env.DB_PATH = join(temp, 'app.db')
const { closeDb } = await import('./db/index')
const { guestLimitOn, setGuestLimit } = await import('./settings')
afterAll(() => { closeDb(); rmSync(temp, { recursive: true }) })

it('비회원 제한은 기본으로 켜져 있고, 관리자가 끄고 다시 켤 수 있다', () => {
  expect(guestLimitOn()).toBe(true)
  setGuestLimit(false)
  expect(guestLimitOn()).toBe(false)
  setGuestLimit(true)
  expect(guestLimitOn()).toBe(true)
})
