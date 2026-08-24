import type { Leg } from '../../engine/types'
import { hhmm } from '../../engine/time'
import type { I18nShape } from '../../i18n'

function seatLabel(leg: Leg, t: I18nShape): { text: string; cls: string } | null {
  if (!leg.seat) return null
  if (leg.seat.available === null) return { text: t.warning['seat-unknown'], cls: 'spine__seat--unknown' }
  if (leg.seat.available === false) return { text: t.warning['seat-sold-out'], cls: 'spine__seat--no' }
  return { text: `${leg.seat.className ?? ''} OK`.trim(), cls: 'spine__seat--ok' }
}

export function TripSpine({ legs, t }: { legs: Leg[]; t: I18nShape }) {
  return (
    <div className="spine">
      {legs.map((leg, i) => {
        const seat = seatLabel(leg, t)
        return (
          <div className="spine__leg" key={i}>
            <div className="spine__time">{hhmm(leg.departAt)}</div>
            <div className="spine__rail">
              <div className={`spine__dot ${leg.discrete ? 'spine__dot--discrete' : ''}`} />
              {i < legs.length - 1 && <div className="spine__line" />}
            </div>
            <div className="spine__body">
              <div className="spine__place">{leg.from.name}</div>
              <div className="spine__mode">
                <span>{t.leg[leg.kind]}</span>
                {leg.carrier && <span>· {leg.carrier}</span>}
                <span className={`spine__badge spine__badge--${leg.confidence}`}>
                  {t.confidence[leg.confidence]}
                </span>
                {leg.origin === 'mock' && <span className="spine__badge spine__badge--estimated">MOCK</span>}
              </div>
              {leg.waitMin > 0 && <div className="spine__mode">{t.leg.wait(leg.waitMin)}</div>}
              {seat && <div className={`spine__seat ${seat.cls}`}>{seat.text}</div>}
            </div>
          </div>
        )
      })}
      {legs.length > 0 && (
        <div className="spine__leg">
          <div className="spine__time">{hhmm(legs[legs.length - 1].arriveAt)}</div>
          <div className="spine__rail">
            <div className="spine__dot" />
          </div>
          <div className="spine__body">
            <div className="spine__place">{legs[legs.length - 1].to.name}</div>
          </div>
        </div>
      )}
    </div>
  )
}
