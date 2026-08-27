/**
 * M0 파서 — 정규식으로 때운다.
 *
 * 이 자리에 Qwen3 0.6B 가 들어온다. 그때도 계약은 같다:
 * 값만 뽑고, 계산·정규화는 하지 않는다. 모르면 null.
 * 그래서 모델로 갈아 끼울 때 이 파일만 바뀐다.
 */
export interface ParsedIntent {
  mode: 'arriveBy' | 'departNow'
  from: string | null
  to: string | null
  /** 원문 그대로. 시각 변환은 resolveWhen() 이 한다. */
  when: string | null
}

const ARRIVE_HINTS = /까지|도착해야|전에|안에|까지는|までに/
const DEPART_HINTS = /지금|몇\s*시.*도착|언제\s*도착|今すぐ/

export function parseUtterance(text: string): ParsedIntent {
  const t = text.trim()

  const mode: ParsedIntent['mode'] =
    ARRIVE_HINTS.test(t) && !/몇\s*시.*도착/.test(t) ? 'arriveBy' : DEPART_HINTS.test(t) ? 'departNow' : 'arriveBy'

  // "A에서 B까지" / "A → B" / "B까지"
  const pair = t.match(/([가-힣A-Za-z0-9]+)\s*(?:에서|부터|→|->|から)\s*([가-힣A-Za-z0-9]+)/)
  const onlyTo = t.match(/([가-힣A-Za-z0-9]+)\s*(?:까지|으로|로|まで)/)

  const when = t.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/)?.[0] ?? null

  return {
    mode,
    from: pair?.[1] ?? null,
    to: pair?.[2] ?? onlyTo?.[1] ?? null,
    when,
  }
}

/**
 * 시각 표현을 오늘/내일 기준 Date 로 바꾼다. 이건 코드의 일이다.
 * "11시", "11시 30분" 같은 문장 표현과 <input type="time"> 의 "23:05" 를 모두 받는다.
 */
export function resolveWhen(when: string | null, now: Date): Date | null {
  if (!when) return null
  const m = when.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/) ?? when.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const d = new Date(now)
  d.setHours(h, min, 0, 0)
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1) // 지난 시각이면 내일
  return d
}
