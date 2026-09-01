import { useEffect, useRef, useState } from 'react'
import { diffMin } from '../../engine/time'
import type { I18nShape } from '../../i18n'

/** 여유 → 슬슬 → 지금. 색으로도 읽히게 한다(설계 문서 "알람" 섹션). */
export type Urgency = 'relaxed' | 'soon' | 'now' | 'overdue'

export function urgencyOf(minutesLeft: number): Urgency {
  if (minutesLeft < 0) return 'overdue'
  if (minutesLeft <= 5) return 'now'
  if (minutesLeft <= 30) return 'soon'
  return 'relaxed'
}

const R = 34
const CIRC = 2 * Math.PI * R

/** 남은 시간을 사람이 읽는 단위로. 한 시간 미만이면 초까지 보여준다. */
function label(msLeft: number, t: I18nShape): string {
  const abs = Math.abs(msLeft)
  const totalSec = Math.floor(abs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const sign = msLeft < 0 ? '-' : ''
  if (h > 0) return `${sign}${h}${t.units.hour} ${m}${t.units.minute}`
  return `${sign}${m}:${String(s).padStart(2, '0')}`
}

/**
 * 출발까지 남은 시간.
 *
 * 매초 갱신하고, 고리가 줄어드는 것으로 남은 양을 보여준다 —
 * 숫자만 있으면 얼마나 급한지가 한눈에 안 들어온다.
 * 기준선은 "계산한 순간부터 출발까지" 라서, 처음에 꽉 찬 고리가 점점 빈다.
 */
export function Countdown({ departAt, t }: { departAt: Date; t: I18nShape }) {
  const [now, setNow] = useState(() => new Date())
  // 계산 시점을 기준으로 고리를 채운다. 여정이 바뀌면 다시 잡는다.
  const span = useRef({ from: Date.now(), to: departAt.getTime() })

  useEffect(() => {
    span.current = { from: Date.now(), to: departAt.getTime() }
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [departAt])

  const msLeft = departAt.getTime() - now.getTime()
  const urgency = urgencyOf(diffMin(departAt, now))

  const total = Math.max(1, span.current.to - span.current.from)
  const ratio = Math.min(1, Math.max(0, msLeft / total))

  const text =
    urgency === 'overdue'
      ? t.result.overdue(label(msLeft, t).replace('-', ''))
      : urgency === 'now'
        ? t.result.leaveNow
        : label(msLeft, t)

  return (
    <div className={`countdown countdown--${urgency}`}>
      <svg className="countdown__ring" viewBox="0 0 80 80" aria-hidden="true">
        <circle className="countdown__track" cx="40" cy="40" r={R} />
        <circle
          className="countdown__fill"
          cx="40"
          cy="40"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - ratio)}
        />
      </svg>
      <div className="countdown__text">
        <span className="countdown__label">{t.result.countdownLabel}</span>
        <span className="countdown__value">{text}</span>
      </div>
    </div>
  )
}
