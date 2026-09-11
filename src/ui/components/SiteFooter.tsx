import { useState } from 'react'
import { isApp } from '../../native/platform'
import { adsEnabled } from '../../ads'
import { Link } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape } from '../../i18n'
import { Logo } from './Logo'
import { ContactDialog } from './ContactDialog'
import { AndroidMark, GitHubMark, SponsorHeart } from './BrandMarks'

const REPO = 'https://github.com/limchanggeon/when-to-leave'
/**
 * 깃허브 스폰서. 등록하기 전에는 프로필로 넘어간다 —
 * 링크를 미리 두면 등록하는 날 저절로 살아난다.
 */
const SPONSOR = 'https://github.com/sponsors/limchanggeon'

/**
 * 안드로이드 앱 내려받기.
 *
 * 깃허브 릴리스에 둔다. 저장소에 넣으면 3.2MB 짜리 바이너리가 판을 올릴
 * 때마다 쌓여 저장소가 계속 무거워진다.
 *
 * **버전을 주소에 박아 둔다.** latest 주소는 사전 릴리스(알파)를 안 가리켜서
 * 지금은 쓸 수 없고, 새 판을 낼 때 여기도 같이 고치게 하는 편이 낫다 —
 * 링크가 조용히 옛 판을 가리키는 것보다 낫다.
 */
const APK =
  'https://github.com/limchanggeon/when-to-leave/releases/download/v0.1.2-alpha/whenigo-0.1.2-alpha.apk'

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

  /*
   * 앱에서는 안 그린다. 같은 내용이 설정 화면에 있다.
   *
   * 재보니 이 푸터가 홈 화면 높이의 35%, 결과 화면의 24%였다. 링크 열 개짜리
   * 사이트맵을 화면마다 발치에 붙여 두는 건 웹의 습관이고, 결과를 보다가
   * 스크롤했더니 후원 링크가 나오는 것은 앱에서 하지 않는 일이다.
   */
  if (isApp()) return null

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
          {/* 마크는 원형 그대로 두고 여백만 준다 — 깃허브 브랜드 지침 */}
          {/*
            * 내려받기. download 속성을 주면 브라우저가 창을 옮기지 않고
            * 파일로 받는다. 다른 사이트 파일이라 강제되지는 않지만,
            * 되는 브라우저에서는 화면이 안 흔들린다.
            */}
          <a className="sitefooter__brandlink" href={APK} download>
            <AndroidMark className="sitefooter__mark--gh" />
            {l.androidApp}
          </a>
          <a className="sitefooter__brandlink" href={REPO} target="_blank" rel="noreferrer">
            <GitHubMark className="sitefooter__mark--gh" />
            {l.source}
          </a>
          <a className="sitefooter__brandlink" href={SPONSOR} target="_blank" rel="noreferrer">
            <SponsorHeart className="sitefooter__mark--gh" />
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
        <p className="sitefooter__note">{adsEnabled ? f.nonprofit : f.nonprofitNoAds}</p>
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
