import { useEffect, useState } from 'react'
import { diffMin, humanDuration } from '../../engine/time'
import type { I18nShape } from '../../i18n'

/** 여유 → 슬슬 → 지금. 색으로도 읽히게 한다(설계 문서 "알람" 섹션). */
export type Urgency = 'relaxed' | 'soon' | 'now' | 'overdue'

export function urgencyOf(minutesLeft: number): Urgency {
  if (minutesLeft < 0) return 'overdue'
  if (minutesLeft <= 5) return 'now'
  if (minutesLeft <= 30) return 'soon'
  return 'relaxed'
}

export function Countdown({ departAt, t }: { departAt: Date; t: I18nShape }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 15)
    return () => clearInterval(id)
  }, [])

  const left = diffMin(departAt, now)
  const urgency = urgencyOf(left)
  const unit = { h: '시간', m: '분' }

  const text =
    urgency === 'overdue'
      ? t.result.overdue(humanDuration(Math.abs(left), unit))
      : urgency === 'now'
        ? t.result.leaveNow
        : humanDuration(left, unit)

  return (
    <div className={`countdown countdown--${urgency}`}>
      <span className="countdown__label">{t.result.countdownLabel}</span>
      <span className="countdown__value">{text}</span>
    </div>
  )
}
