import type { I18nShape } from '../../i18n'

/**
 * 무엇을 하는 서비스인지 세 걸음으로 설명한다.
 *
 * 번호 딱지(01/02/03)를 달지 않는다. 순서라는 사실은 걸음 사이의 화살표가
 * 이미 말하고 있고, 동그라미에 넣은 숫자는 어느 소개 페이지에나 있다.
 *
 * inline 이면 판 아래 띠에 얇게 깔린다.
 */
export function HowItWorks({ t, inline = false }: { t: I18nShape; inline?: boolean }) {
  return (
    <section className={inline ? 'how how--inline' : 'how'} id="how">
      {!inline && (
        <>
          <h2 className="how__title">{t.how.title}</h2>
          <p className="how__lead">{t.how.lead}</p>
        </>
      )}

      <ol className="how__steps">
        {t.how.steps.map((s) => (
          <li className="how__step" key={s.title}>
            <h3 className="how__step-title">{s.title}</h3>
            <p className="how__step-body">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
