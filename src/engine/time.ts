export const MIN = 60_000

export const addMin = (d: Date, m: number): Date => new Date(d.getTime() + m * MIN)
export const diffMin = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / MIN)

/** HH:mm. 자정을 넘겼는지는 호출부가 필요하면 따로 표시한다. */
export const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

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
