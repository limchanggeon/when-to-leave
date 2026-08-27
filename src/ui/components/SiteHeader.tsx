import { Link } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape } from '../../i18n'
import { Logo } from './Logo'

/** 히어로 위에 얹히는 투명 헤더. 결과 화면에서는 배경이 깔린다. */
export function SiteHeader({ t, solid }: { t: I18nShape; solid: boolean }) {
  const { account, signOut } = useAuthContext()

  return (
    <header className={`siteheader ${solid ? 'siteheader--solid' : ''}`}>
      <Link className="siteheader__brand" to="/">
        <Logo className="siteheader__logo" />
        <span className="siteheader__name">{t.app.title}</span>
      </Link>

      <nav className="siteheader__nav">
        <a className="siteheader__link" href="#how">
          {t.nav.how}
        </a>
        {account ? (
          <div className="siteheader__account">
            {account.avatarUrl && <img className="siteheader__avatar" src={account.avatarUrl} alt="" />}
            <span className="siteheader__who">{account.name ?? account.email ?? ''}</span>
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
