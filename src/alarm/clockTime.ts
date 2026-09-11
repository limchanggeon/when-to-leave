/** 시계 앱은 날짜를 받지 않으므로 다음 한 번의 시·분과 같은 날짜인지 확인한다. */
export function clockTime(at: Date, now = new Date()): 'past' | 'date' | null {
  const target = new Date(at)
  target.setSeconds(0, 0)
  if (!Number.isFinite(target.getTime()) || target.getTime() <= now.getTime()) return 'past'
  const next = new Date(now)
  next.setHours(target.getHours(), target.getMinutes(), 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return target.getTime() === next.getTime() ? null : 'date'
}
