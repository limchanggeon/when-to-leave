/**
 * 카운트다운에 걸 글자.
 *
 * React·DOM 의존이 없다 — 앱으로 그대로 간다(docs/PLATFORM.md).
 *
 * 규칙 하나: **숫자는 어느 상태에서도 사라지지 않는다.**
 * 예전에는 출발 5분 전부터 값 자리가 "지금 나가세요" 라는 문장으로 바뀌었는데,
 *   - 5분 내내 한 글자도 안 바뀌어 멈춘 것처럼 보이고,
 *   - 꼬리표와 붙어 "출발까지 / 지금 나가세요" 라는 말이 되지 않는 짝이 되고,
 *   - 판에 16:44 가 걸려 있는데 "지금" 이라고만 하니 서로 어긋나 보이고,
 *   - 정작 제일 급할 때 몇 분 남았는지를 감춘다.
 * 급하다는 것은 꼬리표와 색이 말하고, 숫자는 계속 흐른다.
 */
export type Urgency = 'relaxed' | 'soon' | 'now' | 'overdue'

export function urgencyOf(minutesLeft: number): Urgency {
  if (minutesLeft < 0) return 'overdue'
  if (minutesLeft <= 5) return 'now'
  if (minutesLeft <= 30) return 'soon'
  return 'relaxed'
}

/** 카운트다운이 쓰는 문구만 추린 것 — 사전 전체를 끌고 오지 않는다. */
export interface CountdownStrings {
  units: { hour: string; minute: string }
  countdownLabel: string
  leaveNow: string
  overdueLabel: string
}

/** 남은(또는 지난) 시간. 한 시간 미만이면 초까지 보여준다. */
export function clockText(ms: number, unit: { hour: string; minute: string }): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}${unit.hour} ${m}${unit.minute}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface CountdownFace {
  urgency: Urgency
  /** 위에 붙는 작은 꼬리표. 숫자가 무엇을 뜻하는지 말한다. */
  heading: string
  /** 큰 숫자. 매초 바뀐다. */
  value: string
}

export function countdownFace(msLeft: number, t: CountdownStrings): CountdownFace {
  const urgency = urgencyOf(Math.round(msLeft / 60_000))
  const heading =
    urgency === 'overdue' ? t.overdueLabel : urgency === 'now' ? t.leaveNow : t.countdownLabel
  // 지난 시간에는 음수 부호를 붙이지 않는다 — 꼬리표가 이미 지났다고 말한다.
  return { urgency, heading, value: clockText(msLeft, t.units) }
}
