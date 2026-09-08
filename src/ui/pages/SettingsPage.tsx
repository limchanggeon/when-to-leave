import { useState } from 'react'
import { usePageMeta } from '../usePageMeta'
import { displayName } from '../../auth/displayName'
import { Link, Navigate } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import { adsEnabled } from '../../ads'
import { usePrefs, type Theme } from '../PrefsContext'
import { AppTabs } from '../components/AppTabs'
import { ContactDialog } from '../components/ContactDialog'
import { GitHubMark, SponsorHeart } from '../components/BrandMarks'
import { Tour } from '../components/Tour'
import { isApp } from '../../native/platform'
import type { Lang } from '../../i18n'

const REPO = 'https://github.com/limchanggeon/when-to-leave'
const SPONSOR = 'https://github.com/sponsors/limchanggeon'

/**
 * 앱의 설정 화면. **웹에는 이 경로가 없어도 된다** — 웹은 같은 내용을
 * 머리의 드로어와 발치의 푸터가 나눠 들고 있다.
 *
 * 앱에서 이걸 따로 만든 이유: 푸터가 홈 화면 높이의 35%, 결과 화면의 24%를
 * 차지하고 있었다. 링크 열 개짜리 사이트맵을 화면마다 발치에 붙여 두는 건
 * 웹의 습관이고, 결과를 보다가 스크롤했더니 후원 링크가 나오는 건 앱에서
 * 하지 않는 일이다. 여기로 접어 넣으면 필요한 사람만 열어 본다.
 */
export function SettingsPage() {
  usePageMeta('설정')

  const { t, lang, setLang, theme, setTheme } = usePrefs()
  const { account, signOut } = useAuthContext()
  const [contact, setContact] = useState(false)
  const [tour, setTour] = useState(false)
  const s = t.settings

  /*
   * 웹에는 이 화면이 없다. 같은 내용을 머리의 드로어와 발치의 푸터가
   * 나눠 들고 있고, 여기에는 웹의 머리말도 푸터도 없어서 주소를 직접 치고
   * 들어오면 돌아갈 길이 없는 막다른 화면이 된다.
   */
  if (!isApp()) return <Navigate to="/" replace />

  const LANGS: { id: Lang; label: string }[] = [
    { id: 'ko', label: '한국어' },
    { id: 'ja', label: '日本語' },
  ]
  const THEMES: Theme[] = ['system', 'light', 'dark']

  return (
    <div className="page page--app">
      <header className="appbar">
        <h1 className="appbar__title">{s.title}</h1>
      </header>

      <main className="settings">
        <section className="settings__group">
          <h2 className="settings__head">{s.account}</h2>
          <p className="settings__who">
            {account ? s.signedInAs(displayName(account)) : s.signedOut}
          </p>
          <div className="settings__acts">
            {account ? (
              <>
                <Link className="settings__act" to="/me">
                  {t.nav.myPage}
                </Link>
                {account.isAdmin && (
                  <Link className="settings__act" to="/admin">
                    {t.nav.admin}
                  </Link>
                )}
                <button className="settings__act" type="button" onClick={signOut}>
                  {t.nav.logout}
                </button>
              </>
            ) : (
              <Link className="settings__act settings__act--go" to="/login">
                {t.nav.login}
              </Link>
            )}
          </div>
        </section>

        <section className="settings__group">
          <h2 className="settings__head">{s.display}</h2>

          <div className="settings__row" role="group" aria-label={t.nav.language}>
            <span className="settings__label">{t.nav.language}</span>
            <div className="settings__seg">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`settings__segbtn ${lang === l.id ? 'is-on' : ''}`}
                  aria-pressed={lang === l.id}
                  onClick={() => setLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__row" role="group" aria-label={t.nav.theme}>
            <span className="settings__label">{t.nav.theme}</span>
            <div className="settings__seg">
              {THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  className={`settings__segbtn ${theme === th ? 'is-on' : ''}`}
                  aria-pressed={theme === th}
                  onClick={() => setTheme(th)}
                >
                  {t.nav.themes[th]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings__group">
          <h2 className="settings__head">{s.help}</h2>
          <div className="settings__acts">
            <button className="settings__act" type="button" onClick={() => setTour(true)}>
              {t.tour.open}
            </button>
            <button className="settings__act" type="button" onClick={() => setContact(true)}>
              {t.footerNav.links.contact}
            </button>
            <Link className="settings__act" to="/privacy">
              {t.footerNav.links.privacy}
            </Link>
          </div>
        </section>

        <section className="settings__group">
          <h2 className="settings__head">{s.sources}</h2>
          <ul className="settings__list">
            <li>
              <a href="https://map.kakao.com" target="_blank" rel="noreferrer">
                {s.sourceKakao}
              </a>
            </li>
            <li>
              <a href="https://www.data.go.kr" target="_blank" rel="noreferrer">
                {s.sourceTago}
              </a>
            </li>
          </ul>
        </section>

        <section className="settings__group">
          <h2 className="settings__head">{s.about}</h2>
          <div className="settings__acts">
            <a className="settings__act" href={REPO} target="_blank" rel="noreferrer">
              <GitHubMark className="settings__mark" />
              {s.repo}
            </a>
            <a className="settings__act" href={SPONSOR} target="_blank" rel="noreferrer">
              <SponsorHeart className="settings__mark" />
              {s.sponsor}
            </a>
          </div>
          <dl className="settings__meta">
            <dt>{t.footer.operator}</dt>
            <dd>{t.footer.operatorName}</dd>
            <dt>{t.footer.contactLabel}</dt>
            <dd>
              <a href={`mailto:${t.footer.contactEmail}`}>{t.footer.contactEmail}</a>
            </dd>
          </dl>
          {/* 안 하는 일을 적지 않는다 — 광고를 켤 때만 광고 이야기가 나온다 */}
          <p className="settings__note">{adsEnabled ? t.footer.nonprofit : t.footer.nonprofitNoAds}</p>
          <p className="settings__note">{t.footer.disclaimer}</p>
        </section>
      </main>

      <ContactDialog t={t} open={contact} defaultEmail={account?.email ?? ''} onClose={() => setContact(false)} />
      <Tour t={t} open={tour} onClose={() => setTour(false)} />
      <AppTabs t={t} />
    </div>
  )
}
