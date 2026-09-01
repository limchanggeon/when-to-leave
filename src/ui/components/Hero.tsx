import type { ReactNode } from 'react'
import type { I18nShape } from '../../i18n'

/**
 * 페이지 머리.
 *
 * 넓은 화면에서는 왼쪽에 설명, 오른쪽에 검색 카드를 나란히 둔다 —
 * 세로로만 쌓으면 가로가 절반 비고 페이지가 허전해진다.
 * 결과가 나오면 한 단으로 접어 작업 화면에 자리를 내준다.
 */
export function Hero({
  t,
  compact,
  children,
  aside,
}: {
  t: I18nShape
  compact: boolean
  children: ReactNode
  /** 설명 아래(좁은 화면) 또는 옆(넓은 화면)에 붙는 것 — 예시 칩 등. */
  aside?: ReactNode
}) {
  return (
    <header className={`hero ${compact ? 'hero--compact' : ''}`}>
      <div className="hero__inner">
        {!compact && (
          <div className="hero__intro">
            <p className="hero__eyebrow">{t.app.eyebrow}</p>
            <h1 className="hero__title">{t.app.tagline}</h1>
            <p className="hero__sub">
              {t.app.heroLines.map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </p>
            {/* 다룰 수 있는 범위를 미리 알린다 — 검색해보고 나서야 아는 건 나쁘다 */}
            {t.app.coverage && <p className="hero__coverage">{t.app.coverage}</p>}
            {aside}
          </div>
        )}

        {compact && (
          <div className="hero__intro hero__intro--compact">
            <p className="hero__eyebrow">{t.app.eyebrow}</p>
            <h1 className="hero__title">{t.app.title}</h1>
          </div>
        )}

        <div className="hero__action">{children}</div>
      </div>
    </header>
  )
}
