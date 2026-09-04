import { useEffect, useRef, useState } from 'react'
import type { I18nShape } from '../../i18n'
import { countdownFace } from '../countdownFace'

export { urgencyOf, type Urgency } from '../countdownFace'

const R = 34
const CIRC = 2 * Math.PI * R

/**
 * 고리를 그리는 구간. 이보다 멀면 숫자만 보여준다.
 *
 * 18시간 남은 여정에 꽉 찬 고리를 걸어두면 몇 시간 동안 아무 변화가 없어
 * 진행 표시가 아니라 그냥 동그라미가 된다. 고리는 실제로 줄어드는 게
 * 보일 때만 값을 한다.
 */
const RING_WINDOW_MS = 90 * 60_000

/**
 * 출발까지 남은 시간.
 *
 * 매초 갱신하고, 임박했을 때는 고리가 줄어드는 것으로 남은 양을 보여준다 —
 * 숫자만 있으면 얼마나 급한지가 한눈에 안 들어온다.
 * 기준선은 "계산한 순간부터 출발까지" 라서, 처음에 꽉 찬 고리가 점점 빈다.
 *
 * 무엇을 보여줄지는 countdownFace 가 정한다 — 숫자는 어느 상태에서도
 * 사라지지 않고, 급하다는 것은 꼬리표와 색이 말한다.
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
  const { urgency, heading, value } = countdownFace(msLeft, {
    units: t.units,
    countdownLabel: t.result.countdownLabel,
    leaveNow: t.result.leaveNow,
    overdueLabel: t.result.overdueLabel,
  })

  const total = Math.max(1, span.current.to - span.current.from)
  const ratio = Math.min(1, Math.max(0, msLeft / total))
  // 이미 지났으면 고리는 반드시 비어 있다 — 빈 동그라미는 장식일 뿐이라 걷는다.
  const showRing = msLeft > 0 && msLeft <= RING_WINDOW_MS

  return (
    <div className={`countdown countdown--${urgency}`}>
      {showRing && (
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
      )}
      <div className="countdown__text">
        <span className="countdown__label">{heading}</span>
        <span className="countdown__value num">{value}</span>
      </div>
    </div>
  )
}
