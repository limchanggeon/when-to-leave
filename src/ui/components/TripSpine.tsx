import { diffMin, formatClock, humanDuration } from '../../engine/time'
import type { Leg } from '../../engine/types'
import type { I18nShape } from '../../i18n'

function Seat({ leg, t }: { leg: Leg; t: I18nShape }) {
  if (!leg.seat) return null
  if (leg.seat.available === null)
    return <span className="chip chip--muted">{t.warning['seat-unknown']}</span>
  if (leg.seat.available === false)
    return <span className="chip chip--bad">{t.warning['seat-sold-out']}</span>
  return <span className="chip chip--good">{`${leg.seat.className ?? ''} ${t.seat.ok}`.trim()}</span>
}

/**
 * 여정을 시각 축으로 그린다.
 * 각 구간은 "언제 출발 → 무엇을 타고 몇 분 → 언제 도착"이 한 줄에 읽혀야 한다.
 */
export function TripSpine({
  legs,
  now,
  t,
  onHover,
  active,
}: {
  legs: Leg[]
  now: Date
  t: I18nShape
  /** 구간을 짚었을 때 알린다 — 지도가 같은 지점을 강조한다. */
  onHover?: (index: number | null) => void
  active?: number | null
}) {
  if (legs.length === 0) return null
  const UNIT = { h: t.units.hour, m: t.units.minute }
  const clock = (d: Date) => formatClock(d, now, t.clock)

  return (
    <ol className="spine">
      {legs.map((leg, i) => {
        const rideMin = diffMin(leg.arriveAt, leg.departAt)
        return (
          <li
            className={`spine__row ${active === i ? 'is-active' : ''}`}
            key={i}
            style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(i)}
            onBlur={() => onHover?.(null)}
            tabIndex={0}
          >
            <div className="spine__clock">{clock(leg.departAt)}</div>
            <div className="spine__rail">
              <span className={`spine__dot ${leg.discrete ? 'spine__dot--stop' : ''}`} />
              <span className="spine__line" />
            </div>
            <div className="spine__content">
              <div className="spine__place">{leg.from.name}</div>
              <div className="spine__ride">
                <span className={`spine__kind spine__kind--${leg.kind}`}>{t.leg[leg.kind]}</span>
                {leg.carrier && <span className="spine__carrier">{leg.carrier}</span>}
                <span className="spine__dur">{humanDuration(rideMin, UNIT)}</span>
              </div>
              <div className="spine__tags">
                <span className={`chip chip--${leg.confidence}`}>{t.confidence[leg.confidence]}</span>
                {leg.waitMin > 0 && <span className="chip chip--muted">{t.leg.wait(leg.waitMin)}</span>}
                {leg.frequencyMin ? (
                  <span className="chip chip--muted">{t.leg.frequency(leg.frequencyMin)}</span>
                ) : null}
                {leg.bufferMin > 0 && (
                  <span className="chip chip--muted">{t.result.buffer(leg.bufferMin)}</span>
                )}
                <Seat leg={leg} t={t} />
              </div>
            </div>
          </li>
        )
      })}
      <li
        className={`spine__row spine__row--end ${active === legs.length ? 'is-active' : ''}`}
        style={{ animationDelay: `${Math.min(legs.length, 8) * 45}ms` }}
        onMouseEnter={() => onHover?.(legs.length)}
        onMouseLeave={() => onHover?.(null)}
        tabIndex={0}
      >
        <div className="spine__clock spine__clock--end">
          {clock(legs[legs.length - 1].arriveAt)}
        </div>
        <div className="spine__rail">
          <span className="spine__dot spine__dot--final" />
        </div>
        <div className="spine__content">
          <div className="spine__place spine__place--final">{legs[legs.length - 1].to.name}</div>
        </div>
      </li>
    </ol>
  )
}
