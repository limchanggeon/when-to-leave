import type { AlarmProvider, AlarmRequest, AlarmResult } from './types'

const json = (r: RequestInit['body']) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include' as const,
  body: r,
})

/** 구글 캘린더에 일정을 만든다. 캘린더 앱이 알림을 울려준다. */
export const calendarProvider: AlarmProvider = {
  id: 'google-calendar',
  label: '구글 캘린더',

  async isAvailable() {
    return true // 로그인만 돼 있으면 쓸 수 있다
  },

  async needsSetup() {
    try {
      const res = await fetch('/api/calendar/status', { credentials: 'include' })
      if (!res.ok) return true
      const { connected } = (await res.json()) as { connected: boolean }
      return !connected
    } catch {
      return true
    }
  },

  async schedule(req: AlarmRequest): Promise<AlarmResult> {
    try {
      const res = await fetch(
        '/api/calendar/events',
        json(
          JSON.stringify({
            summary: req.title,
            description: req.body,
            startAt: req.at.toISOString(),
            // 도착 시각을 모르면 10분짜리 일정으로 둔다
            endAt: (req.until ?? new Date(req.at.getTime() + 10 * 60_000)).toISOString(),
            location: req.location,
            reminderMinutes: req.remindBeforeMin ?? [15, 5],
          }),
        ),
      )
      const body = (await res.json()) as
        | { id: string; htmlLink: string }
        | { error: { code: string; message: string } }

      if (!res.ok || 'error' in body) {
        const err = 'error' in body ? body.error : { code: 'failed', message: '' }
        return {
          ok: false,
          failure:
            err.code === 'not-connected' || err.code === 'reconnect-needed'
              ? { code: 'not-connected', message: err.message }
              : { code: 'failed', message: err.message || '일정을 만들지 못했습니다' },
        }
      }
      return { ok: true, link: body.htmlLink }
    } catch {
      return { ok: false, failure: { code: 'failed', message: '서버에 연결하지 못했습니다' } }
    }
  },
}

export async function connectCalendar(): Promise<string | null> {
  try {
    const res = await fetch('/api/calendar/connect', { method: 'POST', credentials: 'include' })
    if (!res.ok) return null
    const { url } = (await res.json()) as { url: string }
    return url
  } catch {
    return null
  }
}
