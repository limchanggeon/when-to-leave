import type { RequestHandler } from 'express'

const strings = new Set([
  'code', 'redirectUri', 'credential', 'email', 'password', 'name', 'current', 'next',
  'label', 'body', 'website', 'note', 'tier', 'summary', 'description', 'startAt', 'endAt', 'location',
])
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const coordinates = (v: Record<string, unknown>): boolean =>
  (v.lat == null || (typeof v.lat === 'number' && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90)) &&
  (v.lng == null || (typeof v.lng === 'number' && Number.isFinite(v.lng) && Math.abs(v.lng) <= 180))

/** TypeScript 단언은 실제 요청을 검증하지 않는다. 잘못된 타입은 400으로 돌려준다. */
export const guardBody: RequestHandler = (req, res, next) => {
  req.body ??= {}
  const body: unknown = req.body
  let valid = object(body)
  if (object(body)) {
    valid &&= Object.entries(body).every(([key, v]) => !strings.has(key) || v == null || typeof v === 'string')
    valid &&= coordinates(body)
    for (const key of ['from', 'to']) {
      const point = body[key]
      if (point != null) valid &&= object(point) && coordinates(point) &&
        (point.name == null || typeof point.name === 'string')
    }
    valid &&= body.on == null || typeof body.on === 'boolean'
    if (body.reminderMinutes != null) valid &&= Array.isArray(body.reminderMinutes) &&
      body.reminderMinutes.length <= 5 && body.reminderMinutes.every((n: unknown) =>
        typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 40320)
    if (body.startAt != null || body.endAt != null) valid &&=
      typeof body.startAt === 'string' && typeof body.endAt === 'string' &&
      Number.isFinite(Date.parse(body.startAt)) && Number.isFinite(Date.parse(body.endAt)) &&
      Date.parse(body.endAt) > Date.parse(body.startAt)
  }
  if (!valid) {
    res.status(400).json({ error: { code: 'bad-request', message: '요청 형식이 올바르지 않습니다' } })
    return
  }
  next()
}
