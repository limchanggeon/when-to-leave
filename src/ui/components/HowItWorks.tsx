import type { I18nShape } from '../../i18n'

/**
 * 무엇을 하는 서비스인지 세 걸음으로 설명한다.
 *
 * inline 이면 히어로 왼쪽 단 안에 얇게 들어간다 — 검색 카드가 오른쪽에서
 * 세로를 차지하는 동안 왼쪽이 비지 않도록. 별도 띠로 아래에 두면
 * 첫 화면에는 빈 공간만 남고 설명은 스크롤 밖으로 밀린다.
 */
export function HowItWorks({ t, inline = false }: { t: I18nShape; inline?: boolean }) {
  return (
    <section className={inline ? 'how how--inline' : 'how'} id="how">
      <p className="how__label">{t.how.label}</p>
      {!inline && (
        <>
          <h2 className="how__title">{t.how.title}</h2>
          <p className="how__lead">{t.how.lead}</p>
        </>
      )}

      <ol className="how__steps">
        {t.how.steps.map((s) => (
          <li className="how__step" key={s.n}>
            <span className="how__n">{s.n}</span>
            <h3 className="how__step-title">{s.title}</h3>
            <p className="how__step-body">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
