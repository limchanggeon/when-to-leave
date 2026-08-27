import type { I18nShape } from '../../i18n'

/** 히어로 아래 설명 구간. 스크롤하면 그냥 끝나던 자리를 채운다. */
export function HowItWorks({ t }: { t: I18nShape }) {
  return (
    <section className="how" id="how">
      <p className="how__label">{t.how.label}</p>
      <h2 className="how__title">{t.how.title}</h2>
      <p className="how__lead">{t.how.lead}</p>

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
