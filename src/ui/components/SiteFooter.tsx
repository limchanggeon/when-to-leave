import { Link } from 'react-router-dom'
import type { I18nShape } from '../../i18n'
import { Logo } from './Logo'

/**
 * 한 줄 푸터.
 *
 * 전에는 서비스·계정·데이터 세 갈래로 아홉 개를 늘어놨는데, 그중 셋은
 * 같은 /me 로 갔고 "구글 지도" 처럼 이 앱이 쓰지도 않는 링크가 섞여 있었다.
 * 갈 곳이 세 군데면 세 개만 둔다 — 갈래를 나누는 건 그다음 문제다.
 */
export function SiteFooter({ t }: { t: I18nShape }) {
  const l = t.footerNav.links

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

        <nav className="sitefooter__links">
          <a href="#how">{l.how}</a>
          <Link to="/me">{l.myPage}</Link>
          <a href="https://github.com/limchanggeon/when-to-leave" target="_blank" rel="noreferrer">
            {l.source}
          </a>
        </nav>
      </div>

      <div className="sitefooter__bar">
        <span>{t.footer.madeWith}</span>
      </div>
    </footer>
  )
}
