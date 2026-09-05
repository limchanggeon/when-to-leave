import { useState } from 'react'

export interface DayPoint {
  day: string
  value: number
}

/**
 * 하루치 막대 하나.
 *
 * 지표마다 자릿수가 달라서(방문 ≫ 검색 ≫ 가입) 한 축에 겹쳐 그리면 작은 것이
 * 바닥에 눌려 안 보인다. 두 개의 y축을 두는 건 더 나쁘다 — 축 두 개짜리
 * 그래프는 어떤 눈금으로 읽어야 할지 알 수 없어서 사실상 거짓말을 한다.
 * 그래서 **작은 그래프 여러 장**으로 나누고 각자 제 눈금을 갖는다.
 *
 * 한 장에 한 계열뿐이라 범례가 필요 없다 — 제목이 곧 계열 이름이다.
 * 숫자는 모든 막대에 붙이지 않는다. 오늘과 최고점만 적는다.
 */
export function DayBars({
  title,
  points,
  total,
}: {
  title: string
  points: DayPoint[]
  total: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...points.map((p) => p.value))
  const peak = points.reduce((b, p, i) => (p.value > points[b].value ? i : b), 0)
  const last = points.length - 1

  const W = 100
  const H = 34
  const gap = 0.6
  const bw = (W - gap * (points.length - 1)) / points.length
  const at = (i: number) => i * (bw + gap)

  const label = (d: string) => d.slice(5).replace('-', '/')

  return (
    <figure className="daybars">
      <figcaption className="daybars__head">
        <span className="daybars__title">{title}</span>
        <span className="daybars__total num">{total.toLocaleString('ko-KR')}</span>
      </figcaption>

      <div className="daybars__plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title} 최근 ${points.length}일`}>
          {/* 바닥선만 둔다. 격자는 데이터보다 앞에 나서면 안 된다. */}
          <line x1="0" y1={H} x2={W} y2={H} stroke="var(--chart-grid)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => {
            const h = p.value === 0 ? 0 : Math.max(0.8, (p.value / max) * (H - 2))
            const isToday = i === last
            return (
              <rect
                key={p.day}
                x={at(i)}
                y={H - h}
                width={bw}
                height={h}
                rx={Math.min(0.9, bw / 2)}
                fill={isToday ? 'var(--chart-accent)' : 'var(--chart-bar)'}
                opacity={hover === null || hover === i ? 1 : 0.45}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            )
          })}
        </svg>

        {/* 손이 닿는 자리는 막대보다 넓게 잡는다 — 1px 막대를 정확히 짚을 수는 없다 */}
        <div className="daybars__hits" onMouseLeave={() => setHover(null)}>
          {points.map((p, i) => (
            <button
              key={p.day}
              type="button"
              className="daybars__hit"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${p.day} ${p.value}`}
            />
          ))}
        </div>

        {hover !== null && (
          <div
            className="daybars__tip num"
            /* 양 끝 막대에서도 밖으로 새지 않게 12~88% 안에 가둔다 */
            style={{
              left: `${Math.min(88, Math.max(12, ((hover + 0.5) / points.length) * 100))}%`,
            }}
          >
            {label(points[hover].day)} · {points[hover].value}
          </div>
        )}
      </div>

      <div className="daybars__foot num">
        <span>{label(points[0].day)}</span>
        {points[peak].value > 0 && peak !== last && (
          <span className="daybars__peak">최고 {points[peak].value}</span>
        )}
        <span>오늘 {points[last].value}</span>
      </div>

      {/* 색과 위치만으로 읽히지 않게, 표로도 볼 수 있게 둔다 */}
      <details className="daybars__table">
        <summary>표로 보기</summary>
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>{title}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.day}>
                <td className="num">{p.day}</td>
                <td className="num">{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
