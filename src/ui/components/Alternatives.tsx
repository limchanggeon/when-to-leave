import { diffMin, formatClock, humanDuration } from '../../engine/time'
import { describeRoute, seatStateOf, transferCount, walkMin } from '../../engine/rank'
import type { I18nShape } from '../../i18n'
import type { RouteOption } from '../planTrip'

/**
 * 이 구간으로 갈 수 있는 길들.
 *
 * **고른 경로도 목록에 넣는다.** 예전에는 대안만 늘어놓아서, 한 번 다른
 * 길을 누르면 처음 답으로 돌아올 방법이 없었다 — 되돌릴 수 없는 선택은
 * 선택이 아니다.
 */
export function Alternatives({
  chosen,
  others,
  reason,
  now,
  t,
  onSelect,
  selectedId,
}: {
  /** 순위가 가장 높은 경로. 늘 맨 위에 놓고, 지금 보는 중이면 표시한다. */
  chosen: RouteOption
  /** 축마다 하나씩 고른 대안. 없을 수 있다. */
  others: RouteOption[]
  reason: string
  now: Date
  t: I18nShape
  onSelect: (r: RouteOption) => void
  selectedId: string
}) {
  const baseline = chosen
  const baselineArrival = chosen.arriveAt
  const items = [chosen, ...others]
  /*
   * 대안이 없다는 건 고장이 아니라 결과다 — 고른 경로가 환승·도보·시간
   * 어느 쪽으로도 지지 않았다는 뜻이다. 그냥 사라지면 그렇게 안 읽히므로
   * 한 줄로 말해준다.
   */
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

          /*
           * 왜 보여주는지를 그 자리에 적는다. "환승 적음" 이 아니라
           * "환승 2번 적음" 이라고 적어야 눌러볼 마음이 생긴다.
           */
          const a = t.alternatives.axis
          const why =
            option.axis === 'fewest-transfers'
              ? a['fewest-transfers'](transferCount(baseline.legs) - transferCount(option.legs))
              : option.axis === 'least-walking'
                ? a['least-walking'](
                    humanDuration(Math.round(walkMin(baseline.legs) - walkMin(option.legs)), unit),
                  )
                : option.axis === 'fastest'
                  ? a.fastest(
                      humanDuration(
                        Math.round(
                          (baseline.arriveAt.getTime() -
                            baseline.departAt.getTime() -
                            (option.arriveAt.getTime() - option.departAt.getTime())) /
                            60_000,
                        ),
                        unit,
                      ),
                    )
                  : null
          const delta = diffMin(option.arriveAt, baselineArrival)
          const deltaText =
            delta === 0
              ? t.alternatives.same
              : delta < 0
                ? t.alternatives.earlier(humanDuration(Math.abs(delta), unit))
                : t.alternatives.later(humanDuration(delta, unit))

          return (
            <button
              className={`alt ${option.id === selectedId ? 'is-on' : ''}`}
              key={option.id}
              onClick={() => onSelect(option)}
              type="button"
            >
              <span className="alt__body">
                <span className="alt__label">
                  {carrier ?? t.route.unnamed}
                  {origin && <span className="alt__origin"> · {origin}</span>}
                </span>
                <span className="alt__meta">
                  {/* 맨 위는 고른 경로다. 왜 이게 답인지를 그 자리에 적는다 */}
                {option.id === chosen.id ? (
                  <span className="alt__why alt__why--chosen">{reason}</span>
                ) : (
                  why && <span className="alt__why">{why}</span>
                )}
                  <span>{t.alternatives.departAt(clock(option.departAt))}</span>
                  <span>{t.alternatives.arriveAt(clock(option.arriveAt))}</span>
                </span>
              </span>
              <span className="alt__right">
                {/* 자기 자신과 견준 "같은 시각" 은 뜻이 없다 — 고른 줄에는 안 적는다 */}
                {option.id !== chosen.id && (
                  <span className={`alt__delta alt__delta--${delta <= 0 ? 'good' : 'bad'}`}>
                    {deltaText}
                  </span>
                )}
                {seat === 'ok' && <span className="alt__seat">{t.seat.ok}</span>}
                {seat === 'sold-out' && <span className="alt__seat alt__seat--no">{t.seat.soldOut}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {/*
        대안이 없다는 건 고장이 아니라 결과다 — 고른 경로가 환승·도보·시간
        어느 쪽으로도 지지 않았다는 뜻이다. 목록에는 그 경로 하나만 남으므로
        왜 하나뿐인지 한 줄로 말해준다.
      */}
      {others.length === 0 && <p className="alts__none">{t.alternatives.none}</p>}
    </section>
  )
}
