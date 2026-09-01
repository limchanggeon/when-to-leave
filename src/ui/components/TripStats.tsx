import { diffMin, humanDuration } from '../../engine/time'
import type { Leg } from '../../engine/types'
import type { I18nShape } from '../../i18n'

/**
 * 여정 요약 수치.
 *
 * 화면을 채우려고 지어낸 값이 아니라, 이미 받아온 데이터에서 뽑은 것들이다.
 * 요금은 구간마다 오는데 지금까지 버리고 있었다.
 */
export function TripStats({ legs, t }: { legs: Leg[]; t: I18nShape }) {
  const unit = { h: t.units.hour, m: t.units.minute }
  const totalMin = diffMin(legs[legs.length - 1].arriveAt, legs[0].departAt)
  const rides = legs.filter((l) => l.kind !== 'walk')
  const walkMin = legs
    .filter((l) => l.kind === 'walk')
    .reduce((sum, l) => sum + diffMin(l.arriveAt, l.departAt), 0)
  const fare = legs.reduce((sum, l) => sum + (l.fare ?? 0), 0)

  const items: { label: string; value: string }[] = [
    { label: t.stats.total, value: humanDuration(totalMin, unit) },
    { label: t.stats.transfers, value: t.stats.transferCount(Math.max(0, rides.length - 1)) },
    { label: t.stats.walk, value: humanDuration(walkMin, unit) },
  ]
  // 요금이 0이면 자료가 없다는 뜻이라 칸을 만들지 않는다
  if (fare > 0) items.push({ label: t.stats.fare, value: t.stats.won(fare) })

  return (
    <dl className="stats">
      {items.map((it) => (
        <div className="stats__item" key={it.label}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
