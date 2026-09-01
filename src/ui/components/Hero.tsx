import type { ReactNode } from 'react'
import type { I18nShape } from '../../i18n'

/**
 * 페이지 머리 — 눈길잡이 문구와 검색.
 *
 * 예전에는 그라디언트 히어로였는데, 시안이 흰 바탕에 큰 제목과
 * 검색바를 두는 방식이라 그쪽으로 맞췄다. 결과가 나오면 제목을 줄여
 * 작업 화면에 자리를 내준다.
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
      <div className="hero__inner">
        <p className="hero__eyebrow">{t.app.eyebrow}</p>
        <h1 className="hero__title">{compact ? t.app.title : t.app.tagline}</h1>
        {!compact && (
          <p className="hero__sub">
            {t.app.heroLines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </p>
        )}
        <div className="hero__action">{children}</div>
      </div>
    </header>
  )
}
