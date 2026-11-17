import { db } from './db/index'

/**
 * 비회원 무료 조회 제한을 켜 둘지. 발표처럼 여러 사람이 처음 써 보는 자리에서 관리자가 끈다.
 *
 * 값이 없으면 켜진 것으로 본다 — 아무도 손대지 않은 상태가 원래 정책이다.
 */
export function guestLimitOn(): boolean {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'guest_limit'").get() as { value: string } | undefined
  return row?.value !== 'off'
}

export function setGuestLimit(on: boolean): void {
  db()
    .prepare("INSERT INTO settings (key, value) VALUES ('guest_limit', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(on ? 'on' : 'off')
}
