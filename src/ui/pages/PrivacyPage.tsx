import { Link } from 'react-router-dom'
import { adsEnabled } from '../../ads'
import { privacyPolicy } from '../../i18n/privacy'
import { usePrefs } from '../PrefsContext'
import { SiteHeader } from '../components/SiteHeader'
import { SiteFooter } from '../components/SiteFooter'

/**
 * 개인정보처리방침.
 *
 * 애드센스가 요구해서 만들었지만, 요구가 없었어도 있어야 할 화면이다.
 * **문장을 지어내지 않았다** — 표와 열을 하나씩 읽고, 바깥으로 나가는
 * 요청을 세어서 실제로 하는 일만 적었다. 코드가 바뀌면 여기도 바뀌어야
 * 한다는 뜻이기도 하다.
 */
export function PrivacyPage() {
  const { t } = usePrefs()
  const p = privacyPolicy

  return (
    <div className="page">
      <SiteHeader t={t} solid />
      <main className="doc">
        <h1 className="doc__title">{p.title}</h1>
        <p className="doc__lead">{p.lead}</p>

        {/*
          * 광고 절은 광고를 실제로 달았을 때만 보인다.
          * 애드센스는 도메인을 사기 전까지 꺼져 있는데(vite.config.ts),
          * 그동안 광고 쿠키를 설명해두면 안 하는 일을 한다고 적는 셈이다.
          */}
        {/*
          * **조 번호는 여기서 매긴다.** 본문에 박아두면 광고 조항이 빠지는
          * 순간(광고를 안 달 때) 제13조 다음이 제15조가 된다 — 법정 문서에서
          * 번호가 건너뛰면 안 된다. 실제로 그렇게 나왔다.
          */}
        {p.sections
          .filter((s) => adsEnabled || !('ads' in s && s.ads))
          .map((s, i) => (
          <section className="doc__section" key={s.h}>
            <h2 className="doc__h">{`제${i + 1}조 (${s.h})`}</h2>
            {s.body.map((line) => (
              <p className="doc__p" key={line}>
                {line}
              </p>
            ))}
            {s.rows && (
              <div className="doc__tablewrap">
                <table className="doc__table">
                  <thead>
                    <tr>
                      {s.cols!.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r[0]}>
                        {r.map((cell, i) => (
                          <td key={i}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        <p className="doc__updated">{p.updated}</p>
        <Link className="doc__back" to="/">
          {p.back}
        </Link>
      </main>
      <SiteFooter t={t} />
    </div>
  )
}
