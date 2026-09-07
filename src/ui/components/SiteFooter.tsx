import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape } from '../../i18n'
import { Logo } from './Logo'
import { ContactDialog } from './ContactDialog'

const REPO = 'https://github.com/limchanggeon/when-to-leave'
/**
 * 깃허브 스폰서. 등록하기 전에는 프로필로 넘어간다 —
 * 링크를 미리 두면 등록하는 날 저절로 살아난다.
 */
const SPONSOR = 'https://github.com/sponsors/limchanggeon'

/**
 * 승강장 옆에 붙은 안내문.
 *
 * 전에는 링크가 셋뿐이었다. 그 전에는 아홉이었는데 그중 셋이 같은 /me 로 가고
 * "구글 지도" 처럼 쓰지도 않는 서비스가 섞여 있어 줄인 것이었다. 지금 다시
 * 늘리는 건 갈 곳이 실제로 늘어서가 아니라, **누가 만들었고 무슨 데이터를
 * 쓰는지** 를 밝힐 자리가 필요해서다. 링크는 여전히 실재하는 곳만 넣는다.
 *
 * 사업자등록번호·통신판매업신고번호 자리는 비워두지 않고 아예 두지 않는다.
 * 개인이 만든 비영리 서비스라 그런 번호가 없고, 없는 번호를 지어내면
 * 그 줄 전체가 거짓이 된다. 대신 없는 이유를 한 줄로 적는다.
 */
export function SiteFooter({ t, onHowTo }: { t: I18nShape; onHowTo?: () => void }) {
  /* 로그인해 있으면 문의 창의 회신 주소를 미리 채운다. */
  const { account } = useAuthContext()
  const l = t.footerNav.links
  const f = t.footer
  const [contact, setContact] = useState(false)

  return (
    <footer className="sitefooter">
      <div className="sitefooter__cols">
        <section className="sitefooter__col">
          <h2 className="sitefooter__head">{t.footerNav.trip}</h2>
          <Link to="/">{l.home}</Link>
          <a href="/#how">{l.how}</a>
          {/* 사용법은 홈에 얹힌 스포트라이트라, 그 화면에서만 열 수 있다 */}
          {onHowTo && (
            <button type="button" className="sitefooter__linkbtn" onClick={onHowTo}>
              {l.tour}
            </button>
          )}
        </section>

        <section className="sitefooter__col">
          <h2 className="sitefooter__head">{t.footerNav.account}</h2>
          <Link to="/login">{l.login}</Link>
          <Link to="/me">{l.myPage}</Link>
        </section>

        <section className="sitefooter__col">
          <h2 className="sitefooter__head">{t.footerNav.data}</h2>
          <a href="https://map.kakao.com" target="_blank" rel="noreferrer">
            {l.kakao}
          </a>
          <a href="https://www.data.go.kr" target="_blank" rel="noreferrer">
            {l.tago}
          </a>
        </section>

        <section className="sitefooter__col">
          <h2 className="sitefooter__head">{t.footerNav.project}</h2>
          <a href={REPO} target="_blank" rel="noreferrer">
            {l.source}
          </a>
          <a href={SPONSOR} target="_blank" rel="noreferrer">
            {l.sponsor}
          </a>
          <Link to="/privacy">{l.privacy}</Link>
          <button type="button" className="sitefooter__linkbtn" onClick={() => setContact(true)}>
            {l.contact}
          </button>
        </section>

        <div className="sitefooter__mark">
          <Logo className="sitefooter__logo" />
          <p className="sitefooter__sign">{f.sign}</p>
        </div>
      </div>

      <div className="sitefooter__base">
        <dl className="sitefooter__facts">
          <div>
            <dt>{f.operator}</dt>
            <dd>{f.operatorName}</dd>
          </div>
          <div>
            <dt>{f.contactLabel}</dt>
            <dd>
              <a href={`mailto:${f.contactEmail}`}>{f.contactEmail}</a>
            </dd>
          </div>
        </dl>
        <p className="sitefooter__note">{f.nonprofit}</p>
        <p className="sitefooter__note">{f.disclaimer}</p>
      </div>

      <ContactDialog
        t={t}
        open={contact}
        onClose={() => setContact(false)}
        defaultEmail={account?.email}
      />
    </footer>
  )
}
