import type { ReactNode } from 'react'
import type { I18nShape } from '../../i18n'

/**
 * 안내판.
 *
 * 이 앱이 답해야 하는 질문은 "몇 시에 나가야 하는가" 하나뿐이라,
 * 판에는 늘 그 답이 걸린다 — 아직 물어보지 않았으면 무엇을 답해줄지가,
 * 물어봤으면 시각이. 어두운 곳은 화면에서 여기 하나뿐이다.
 *
 * 오른쪽에는 검색이 붙어 있다. 답을 보면서 조건을 바꿀 수 있어야 하므로
 * 결과가 나와도 치우지 않는다.
 */
export function Hero({
  t,
  headline,
  children,
  aside,
}: {
  t: I18nShape
  /** 결과가 있으면 그 답. 없으면 소개 문구가 대신 걸린다. */
  headline?: ReactNode
  children: ReactNode
  /** 설명 아래(좁은 화면) 또는 옆(넓은 화면)에 붙는 것 — 예시 칩 등. */
  aside?: ReactNode
}) {
  return (
    <header className={`hero ${headline ? 'hero--answered' : ''}`}>
      <div className="hero__inner">
        <div className="hero__intro">
          {headline ?? (
            <>
              <h1 className="hero__title">{t.app.tagline}</h1>
              <p className="hero__sub">
                {t.app.heroLines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </p>
              {/* 다룰 수 있는 범위를 미리 알린다 — 검색해보고 나서야 아는 건 나쁘다 */}
              {t.app.coverage && <p className="hero__coverage">{t.app.coverage}</p>}
              {aside}
            </>
          )}
        </div>

        <div className="hero__action">{children}</div>
      </div>
    </header>
  )
}
