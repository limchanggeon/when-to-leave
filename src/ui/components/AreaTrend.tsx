import { useId, useState } from 'react'
import type { DayPoint } from './DayBars'

/**
 * 추세 하나를 크게 보여주는 면적 그래프.
 *
 * 계열이 하나뿐이라 범례가 없다 — 제목이 곧 계열 이름이다.
 * 채움은 아주 옅게 둔다. 면적은 "얼마나" 를 거들 뿐이고, 읽는 것은 선이다.
 *
 * 값은 모든 점에 붙이지 않는다. 짚은 곳만 십자선과 함께 말한다 —
 * 점마다 숫자를 달면 그래프가 아니라 빽빽한 표가 된다.
 */
export function AreaTrend({ title, points }: { title: string; points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId()

  const W = 300
  const H = 90
  const PAD = 6
  const max = Math.max(1, ...points.map((p) => p.value))
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * W
  const y = (v: number) => PAD + (1 - v / max) * (H - PAD * 2)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const label = (d: string) => d.slice(5).replace('-', '/')
  const mid = Math.floor(points.length / 2)

  return (
    <figure className="trend">
      <figcaption className="trend__title">{title}</figcaption>

      <div className="trend__plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title} 추세`}>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-bar)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-bar)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 눈금은 데이터보다 앞에 나서지 않는다 */}
          <line x1="0" y1={y(max)} x2={W} y2={y(max)} stroke="var(--chart-grid)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={H} x2={W} y2={H} stroke="var(--chart-grid)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />

          <path d={area} fill={`url(#g${gid})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--chart-bar)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover !== null && (
            <>
              <line
                x1={x(hover)} y1={0} x2={x(hover)} y2={H}
                stroke="var(--chart-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
              {/* 표면색 링을 둘러 선 위에서도 점이 또렷하다 */}
              <circle cx={x(hover)} cy={y(points[hover].value)} r="4"
                fill="var(--chart-accent)" stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>

        {/* 짚는 자리는 점보다 넓게 — 2px 선을 정확히 겨눌 수는 없다 */}
        <div className="trend__hits">
          {points.map((p, i) => (
            <button
              key={p.day}
              type="button"
              className="trend__hit"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${p.day} ${p.value}`}
            />
          ))}
        </div>

        {hover !== null && (
          <div
            className="trend__tip num"
            style={{ left: `${Math.min(86, Math.max(14, (hover / (points.length - 1)) * 100))}%` }}
          >
            {label(points[hover].day)} · {points[hover].value}
          </div>
        )}

        <span className="trend__max num">{max}</span>
      </div>

      <div className="trend__axis num">
        <span>{label(points[0].day)}</span>
        <span>{label(points[mid].day)}</span>
        <span>{label(points[points.length - 1].day)}</span>
      </div>
    </figure>
  )
}
