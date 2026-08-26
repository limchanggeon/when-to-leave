import type { ReactNode } from 'react'
import type { I18nShape } from '../../i18n'
import { RouteArt } from './RouteArt'

/**
 * 랜딩 히어로. 결과가 나오면 compact 로 접혀 작업 화면에 자리를 내준다 —
 * 시간표처럼 조밀한 데이터는 그라디언트 위에서 읽기 어렵다.
 */
export function Hero({
  t,
  compact,
  children,
}: {
  t: I18nShape
  compact: boolean
  children: ReactNode
}) {
  return (
    <header className={`hero ${compact ? 'hero--compact' : ''}`}>
      <div className="hero__stars" aria-hidden="true" />
      <div className="hero__inner">
        <p className="hero__eyebrow">{t.app.eyebrow}</p>
        <h1 className="hero__title">{t.app.title}</h1>
        {!compact && (
          <p className="hero__sub">
            {t.app.heroLines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </p>
        )}
        <div className="hero__action">{children}</div>
      </div>
      {!compact && <RouteArt />}
    </header>
  )
}
