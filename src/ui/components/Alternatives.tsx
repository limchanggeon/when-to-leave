import { diffMin, formatClock, humanDuration } from '../../engine/time'
import { describeRoute, seatStateOf } from '../../engine/rank'
import type { I18nShape } from '../../i18n'
import type { RouteOption } from '../planTrip'

export function Alternatives({
  items,
  baselineArrival,
  now,
  t,
  onSelect,
  selectedRung,
}: {
  items: RouteOption[]
  baselineArrival: Date
  now: Date
  t: I18nShape
  onSelect: (r: RouteOption) => void
  selectedRung: number
}) {
  if (items.length === 0) return null
  const clock = (d: Date) => formatClock(d, now, t.clock)
  const unit = { h: t.units.hour, m: t.units.minute }

  return (
    <section className="alts">
      <header className="alts__head">
        <h2 className="alts__title">{t.route.others}</h2>
        <p className="alts__sub">{t.route.othersSub}</p>
      </header>
      <div className="alts__list">
        {items.map((option) => {
          const { carrier, origin } = describeRoute(option.legs)
          const seat = seatStateOf(option.legs)
          const delta = diffMin(option.arriveAt, baselineArrival)
          const deltaText =
            delta === 0
              ? t.alternatives.same
              : delta < 0
                ? t.alternatives.earlier(humanDuration(Math.abs(delta), unit))
                : t.alternatives.later(humanDuration(delta, unit))

          return (
            <button
              className={`alt ${option.rung === selectedRung ? 'is-on' : ''}`}
              key={option.rung}
              onClick={() => onSelect(option)}
              type="button"
            >
              <span className="alt__body">
                <span className="alt__label">
                  {carrier ?? t.route.unnamed}
                  {origin && <span className="alt__origin"> · {origin}</span>}
                </span>
                <span className="alt__meta">
                  <span>{t.alternatives.departAt(clock(option.departAt))}</span>
                  <span>{t.alternatives.arriveAt(clock(option.arriveAt))}</span>
                </span>
              </span>
              <span className="alt__right">
                <span className={`alt__delta alt__delta--${delta <= 0 ? 'good' : 'bad'}`}>
                  {deltaText}
                </span>
                {seat === 'ok' && <span className="alt__seat">{t.seat.ok}</span>}
                {seat === 'sold-out' && <span className="alt__seat alt__seat--no">{t.seat.soldOut}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
