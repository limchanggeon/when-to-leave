import { diffMin, formatClock, humanDuration } from '../../engine/time'
import type { Leg } from '../../engine/types'
import type { I18nShape } from '../../i18n'

export interface AlternativeView {
  rung: number
  labelKey: string
  legs: Leg[]
  departAt: Date
  arriveAt: Date
}

export function Alternatives({
  items,
  baselineArrival,
  now,
  t,
  onSelect,
}: {
  items: AlternativeView[]
  baselineArrival: Date
  now: Date
  t: I18nShape
  onSelect: (a: AlternativeView) => void
}) {
  if (items.length === 0) return null
  const clock = (d: Date) => formatClock(d, now, t.clock)

  return (
    <section className="alts">
      <header className="alts__head">
        <h2 className="alts__title">{t.alternatives.title}</h2>
        <p className="alts__sub">{t.alternatives.subtitle}</p>
      </header>
      <div className="alts__list">
        {items.map((a) => {
          const delta = diffMin(a.arriveAt, baselineArrival)
          const unit = { h: '시간', m: '분' }
          const deltaText =
            delta === 0
              ? t.alternatives.same
              : delta < 0
                ? t.alternatives.earlier(humanDuration(Math.abs(delta), unit))
                : t.alternatives.later(humanDuration(delta, unit))
          const carrier = a.legs.find((l) => l.discrete && l.carrier)?.carrier
          const seat = a.legs.find((l) => l.seat)?.seat

          return (
            <button className="alt" key={a.rung} onClick={() => onSelect(a)} type="button">
              <span className="alt__rung">{String(a.rung).padStart(2, '0')}</span>
              <span className="alt__body">
                <span className="alt__label">{t.fallback[a.labelKey] ?? a.labelKey}</span>
                <span className="alt__meta">
                  {carrier && <span>{carrier}</span>}
                  <span>{t.alternatives.departAt(clock(a.departAt))}</span>
                  <span>{t.alternatives.arriveAt(clock(a.arriveAt))}</span>
                </span>
              </span>
              <span className="alt__right">
                <span className={`alt__delta alt__delta--${delta <= 0 ? 'good' : 'bad'}`}>
                  {deltaText}
                </span>
                {seat && seat.available === true && <span className="alt__seat">좌석 있음</span>}
                {seat && seat.available === false && (
                  <span className="alt__seat alt__seat--no">매진</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
