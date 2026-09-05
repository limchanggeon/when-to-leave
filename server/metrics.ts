import { db } from './db/index'

/**
 * 하루치 집계.
 *
 * 개별 방문 기록을 남기지 않는다 — IP 도 방문자 식별자도 저장하지 않는다.
 * 대시보드에 필요한 건 "어제 몇 번" 이지 "누가" 가 아니고, 남기지 않으면
 * 새지도 않는다.
 */
export type Metric = 'visit' | 'search' | 'signup' | 'login'

/** 한국 날짜. timezone.ts 가 프로세스 시간대를 못 박아 둔 것에 기댄다. */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 하나 올린다.
 *
 * 집계는 서비스의 본 일이 아니므로 **절대 요청을 깨뜨리지 않는다.**
 * DB 가 잠겨 있든 표가 없든, 세다가 실패했다고 사용자의 경로 조회가
 * 실패하면 앞뒤가 바뀐 것이다.
 */
export function bump(metric: Metric, n = 1): void {
  try {
    db()
      .prepare(
        `INSERT INTO daily_counts (day, metric, count) VALUES (?, ?, ?)
         ON CONFLICT(day, metric) DO UPDATE SET count = count + excluded.count`,
      )
      .run(today(), metric, n)
  } catch {
    /* 세는 일로 서비스를 멈추지 않는다 */
  }
}

export interface DayRow {
  day: string
  visit: number
  search: number
  signup: number
  login: number
}

/**
 * 최근 N일. **빈 날도 0 으로 채워서** 돌려준다.
 *
 * 없는 날을 빼고 주면 그래프가 시간을 건너뛰어, 이틀 쉰 것과 하루 쉰 것이
 * 같아 보인다. 축이 거짓말을 하게 두지 않는다.
 */
export function recentDays(days = 30): DayRow[] {
  const rows = db()
    .prepare('SELECT day, metric, count FROM daily_counts WHERE day >= ?')
    .all(today(new Date(Date.now() - (days - 1) * 86_400_000))) as {
    day: string
    metric: Metric
    count: number
  }[]

  const byDay = new Map<string, DayRow>()
  for (let i = days - 1; i >= 0; i--) {
    const day = today(new Date(Date.now() - i * 86_400_000))
    byDay.set(day, { day, visit: 0, search: 0, signup: 0, login: 0 })
  }
  for (const r of rows) {
    const row = byDay.get(r.day)
    if (row) row[r.metric] = r.count
  }
  return [...byDay.values()]
}
