import { Link } from 'react-router-dom'
import type { I18nShape } from '../../i18n'
import { Logo } from './Logo'

/** 다단 푸터. 시안처럼 링크를 갈래별로 묶는다. */
export function SiteFooter({ t }: { t: I18nShape }) {
  const l = t.footerNav.links
  const columns: { title: string; items: { label: string; to?: string; href?: string }[] }[] = [
    {
      title: t.footerNav.service,
      items: [
        { label: l.home, to: '/' },
        { label: l.how, href: '#how' },
        { label: l.calendar, to: '/me' },
      ],
    },
    {
      title: t.footerNav.account,
      items: [
        { label: l.login, to: '/login' },
        { label: l.myPage, to: '/me' },
        { label: l.places, to: '/me' },
      ],
    },
    {
      title: t.footerNav.data,
      items: [
        { label: l.odsay, href: 'https://lab.odsay.com' },
        { label: l.kakao, href: 'https://developers.kakao.com' },
        { label: l.google, href: 'https://developers.google.com/maps' },
      ],
    },
  ]

  return (
    <footer className="sitefooter">
      <div className="sitefooter__inner">
        <div className="sitefooter__brand">
          <Logo className="sitefooter__logo" />
          <div>
            <p className="sitefooter__name">{t.app.title}</p>
            <p className="sitefooter__tagline">{t.footer.tagline}</p>
          </div>
        </div>

        <nav className="sitefooter__cols">
          {columns.map((col) => (
            <div className="sitefooter__col" key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.items.map((item) => (
                  <li key={item.label}>
                    {item.to ? (
                      <Link to={item.to}>{item.label}</Link>
                    ) : (
                      <a href={item.href} target={item.href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">
                        {item.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="sitefooter__bar">
        <span>{t.footer.madeWith}</span>
        <a href="https://github.com/limchanggeon/when-to-leave" target="_blank" rel="noreferrer">
          {l.source} ↗
        </a>
      </div>
    </footer>
  )
}
