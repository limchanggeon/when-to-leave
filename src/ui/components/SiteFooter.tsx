import type { I18nShape } from '../../i18n'
import { Logo } from './Logo'

export function SiteFooter({ t }: { t: I18nShape }) {
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
        <div className="sitefooter__meta">
          <p>{t.footer.madeWith}</p>
          <a href="https://github.com/limchanggeon/when-to-leave" target="_blank" rel="noreferrer">
            {t.footer.repo} ↗
          </a>
        </div>
      </div>
    </footer>
  )
}
