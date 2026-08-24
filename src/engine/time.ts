export const MIN = 60_000

export const addMin = (d: Date, m: number): Date => new Date(d.getTime() + m * MIN)
export const diffMin = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / MIN)

/** HH:mm. 날짜 정보가 빠지므로 자정을 넘는 여정에는 formatClock 을 쓴다. */
export const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** 자정 기준으로 며칠 차이인지. 같은 날이면 0, 다음날이면 1. */
export function dayOffset(d: Date, base: Date): number {
  const a = new Date(d).setHours(0, 0, 0, 0)
  const b = new Date(base).setHours(0, 0, 0, 0)
  return Math.round((a - b) / 86_400_000)
}

/**
 * 날짜 넘김이 보이는 시각 표기.
 * 하루를 넘는 여정에서 HH:mm 만 찍으면 18:10 → 10:52 같은 헛소리가 나온다.
 */
export function formatClock(d: Date, base: Date, labels: { tomorrow: string; dayAfter: string; nDays: (n: number) => string }): string {
  const off = dayOffset(d, base)
  const time = hhmm(d)
  if (off === 0) return time
  if (off === 1) return `${labels.tomorrow} ${time}`
  if (off === 2) return `${labels.dayAfter} ${time}`
  return `${labels.nDays(off)} ${time}`
}

/** "1시간 42분" / "8분" — 0분이면 빈 문자열. */
export function humanDuration(min: number, unit: { h: string; m: string }): string {
  const sign = min < 0 ? '-' : ''
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${sign}${m}${unit.m}`
  if (m === 0) return `${sign}${h}${unit.h}`
  return `${sign}${h}${unit.h} ${m}${unit.m}`
}

/** 오늘 날짜에 HH:mm 을 붙인 Date. 목업 어댑터가 시간표를 만들 때 쓴다. */
export function at(base: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}
