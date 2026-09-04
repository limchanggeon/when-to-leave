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

export function SiteHeader({
  t,
  solid,
  onHome,
  onHowTo,
}: {
  t: I18nShape
  solid: boolean
  /**
   * 이미 홈에 있을 때 브랜드를 누르면 무엇을 할지.
   *
   * 결과는 라우터가 아니라 홈 화면의 상태로 들고 있어서, `/` 에서 `/` 로 가는
   * Link 는 아무것도 다시 그리지 않는다. 로고를 눌러도 결과가 그대로 남아
   * 눌리지 않는 것처럼 보였다. 홈 화면이 되돌리는 방법을 여기로 넘겨준다.
   */
  onHome?: () => void
  /**
   * 사용법을 여는 방법. 홈만 넘겨준다 — 짚어줄 화면이 거기뿐이라,
   * 마이페이지에서 물음표를 눌러봐야 가리킬 자리가 없다.
   */
  onHowTo?: () => void
}) {
  const { account, signOut } = useAuthContext()
  const { lang, setLang, theme, setTheme } = usePrefs()

  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]

  return (
    <header className={`siteheader ${solid ? 'siteheader--solid' : ''}`}>
      <Link className="siteheader__brand" to="/" onClick={onHome}>
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

        {onHowTo && (
          <button
            type="button"
            className="siteheader__icon"
            onClick={onHowTo}
            title={t.tour.open}
            aria-label={t.tour.open}
          >
            ?
          </button>
        )}

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
  )
}
