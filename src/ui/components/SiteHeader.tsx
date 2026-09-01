import { Link } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape, Lang } from '../../i18n'
import { usePrefs, type Theme } from '../PrefsContext'
import { Logo } from './Logo'

const LANGS: { id: Lang; short: string }[] = [
  { id: 'ko', short: '한국어' },
  { id: 'ja', short: '日本語' },
]

const THEME_ORDER: Theme[] = ['system', 'light', 'dark']
const THEME_ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' }

export function SiteHeader({ t, solid }: { t: I18nShape; solid: boolean }) {
  const { account, signOut } = useAuthContext()
  const { lang, setLang, theme, setTheme } = usePrefs()

  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]

  const navItems = [
    { label: t.nav2.home, to: '/' },
    { label: t.nav2.saved, to: '/me' },
    { label: t.nav2.calendar, to: '/me' },
    { label: t.nav2.how, href: '#how' },
  ]

  return (
    <>
    <header className={`siteheader ${solid ? 'siteheader--solid' : ''}`}>
      <Link className="siteheader__brand" to="/">
        <Logo className="siteheader__logo" />
        <span className="siteheader__name">{t.app.title}</span>
      </Link>

      <nav className="siteheader__nav">
        <div className="langswitch" role="group" aria-label={t.nav.language}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`langswitch__btn ${lang === l.id ? 'is-on' : ''}`}
              onClick={() => setLang(l.id)}
              aria-pressed={lang === l.id}
            >
              {l.short}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="siteheader__icon"
          onClick={() => setTheme(nextTheme)}
          title={`${t.nav.theme}: ${t.nav.themes[theme]}`}
          aria-label={`${t.nav.theme}: ${t.nav.themes[theme]}`}
        >
          {THEME_ICON[theme]}
        </button>

        {account ? (
          <div className="siteheader__account">
            <Link className="siteheader__me" to="/me">
              {account.avatarUrl && <img className="siteheader__avatar" src={account.avatarUrl} alt="" />}
              <span className="siteheader__who">{account.name ?? account.email ?? ''}</span>
            </Link>
            <button className="siteheader__btn siteheader__btn--ghost" type="button" onClick={signOut}>
              {t.nav.logout}
            </button>
          </div>
        ) : (
          <Link className="siteheader__btn siteheader__btn--solid" to="/login">
            {t.nav.login}
          </Link>
        )}
      </nav>
    </header>

    {/* 시안의 네비줄 — 화면 사이를 오갈 길을 늘 보이게 둔다 */}
    <nav className="navrow">
      <div className="navrow__inner">
        {navItems.map((item) =>
          item.to ? (
            <Link className="navrow__item" key={item.label} to={item.to}>
              {item.label}
            </Link>
          ) : (
            <a className="navrow__item" key={item.label} href={item.href}>
              {item.label}
            </a>
          ),
        )}
      </div>
    </nav>
    </>
  )
}
