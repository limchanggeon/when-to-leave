import { Link } from 'react-router-dom'
import { LangMenu } from './LangMenu'
import { displayName } from '../../auth/displayName'
import { isApp } from '../../native/platform'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape } from '../../i18n'
import { usePrefs, type Theme } from '../PrefsContext'
import { Logo } from './Logo'
import { useQuota } from '../quota'
import { useEffect, useRef, useState } from 'react'


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
  /* 다 쓰고 나서야 알면 늦다. 남은 횟수를 미리 보여준다. */
  const quota = useQuota(Boolean(account))
  const { theme, setTheme } = usePrefs()

  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]

  /*
   * 좁은 화면에서는 항목을 서랍에 넣는다.
   *
   * 로그인하고 관리자이기까지 하면 머리말에 여덟 가지가 들어간다 —
   * 로고·이름·언어 둘·사용법·테마·남은 횟수·관리자·내 계정·로그아웃.
   * 640px 아래에서는 그게 다 안 들어가서 로그아웃이 화면 밖으로 밀렸다.
   * 하나씩 숨기는 것으로는 안 된다. 다 숨기면 쓸 수 없고, 덜 숨기면 넘친다.
   */
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /* 밖을 누르거나 Esc 를 누르면 닫는다. 서랍은 닫을 수 있어야 서랍이다. */
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /*
   * 앱에서는 머리말이 이름표만 단다.
   *
   * 여기 있던 것들(언어·테마·사용법·로그인·마이페이지)은 전부 아래 탭과
   * 설정 화면으로 내려갔다 — 6인치 화면 맨 위는 엄지가 가장 닿기 어려운
   * 자리라, 자주 누르는 것을 거기 두는 것은 웹에서만 통하는 배치다.
   * 남은 횟수만 남긴다. 검색하기 전에 알아야 하는 값이라 검색 화면에 있어야 한다.
   */
  if (isApp()) {
    return (
      <header className="appbar">
        <Link className="appbar__brand" to="/" onClick={onHome}>
          <Logo className="appbar__logo" />
          <span className="appbar__name">{t.app.title}</span>
        </Link>
        {quota?.left !== null && quota?.left !== undefined && (
          <span className={`appbar__quota ${quota.left <= 1 ? 'is-low' : ''}`}>
            {t.quota.left(quota.left)}
          </span>
        )}
      </header>
    )
  }

  return (
    <header className={`siteheader ${solid ? 'siteheader--solid' : ''}`}>
      <Link className="siteheader__brand" to="/" onClick={onHome}>
        <Logo className="siteheader__logo" />
        <span className="siteheader__name">{t.app.title}</span>
      </Link>

      <nav className="siteheader__nav">
        <div className="siteheader__wide">
        <LangMenu />

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
            {account.isAdmin && (
              <Link className="siteheader__btn siteheader__btn--ghost" to="/admin">
                관리자
              </Link>
            )}
            {/*
              제한이 있는 등급에만 띄운다. 무제한인 사람에게 숫자를 보여주면
              읽을 이유가 없는 글자만 늘어난다. 하나 남았을 때만 색이 선다 —
              늘 눈에 띄면 아무 때도 눈에 안 띈다.
            */}
            {quota?.left !== null && quota?.left !== undefined && (
              <span
                className={`siteheader__quota ${quota.left <= 1 ? 'is-low' : ''}`}
                title={`${quota.label} · 하루 ${quota.limit}회`}
              >
                {t.quota.left(quota.left)}
              </span>
            )}
            <Link className="siteheader__me" to="/me">
              {account.avatarUrl && <img className="siteheader__avatar" src={account.avatarUrl} alt="" />}
              <span className="siteheader__who">{displayName(account)}</span>
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
        </div>

        {/*
          좁은 화면용 서랍. 위의 묶음을 통째로 숨기고 이것만 남긴다.
          로그인하지 않았으면 서랍 대신 로그인 버튼 하나면 되므로 안 띄운다 —
          누를 것이 하나뿐인데 서랍에 넣으면 한 번 더 누르게 만들 뿐이다.
        */}
        <div className="siteheader__narrow" ref={menuRef}>
          {!account && (
            <Link className="siteheader__btn siteheader__btn--solid" to="/login">
              {t.nav.login}
            </Link>
          )}
          <button
            type="button"
            className="siteheader__icon"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
            aria-label={t.nav.menu}
          >
            ☰
          </button>

          {/*
            ARIA 의 menu 역할을 붙이지 않는다. 그건 화살표 키로 항목 사이를
            옮겨 다니는 조작까지 구현해야 맞는 역할인데, 그러지 않을 거면
            안 붙이는 편이 낫다 — 없는 조작을 스크린리더에 약속하는 셈이다.
            그냥 누르는 것들이므로 링크와 버튼 그대로 둔다.
          */}
          {menu && (
            <div className="hmenu">
              {account && (
                <div className="hmenu__who">
                  {displayName(account)}
                  {quota?.left !== null && quota?.left !== undefined && (
                    <span className={`hmenu__quota ${quota.left <= 1 ? 'is-low' : ''}`}>
                      {t.quota.left(quota.left)}
                    </span>
                  )}
                </div>
              )}

              <div className="hmenu__row">
                <span className="hmenu__rowlabel">{t.nav.language}</span>
                <LangMenu className="langmenu--up" />
              </div>

              <button
                type="button"
                className="hmenu__item"
                onClick={() => {
                  setTheme(nextTheme)
                }}
              >
                {t.nav.theme} · {t.nav.themes[theme]}
              </button>

              {onHowTo && (
                <button
                  type="button"
                  className="hmenu__item"
                  onClick={() => {
                    setMenu(false)
                    onHowTo()
                  }}
                >
                  {t.tour.open}
                </button>
              )}

              {account && (
                <>
                  <Link className="hmenu__item" to="/me" onClick={() => setMenu(false)}>
                    {t.nav.myPage}
                  </Link>
                  {account.isAdmin && (
                    <Link className="hmenu__item" to="/admin" onClick={() => setMenu(false)}>
                      {t.nav.admin}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="hmenu__item"
                    onClick={() => {
                      setMenu(false)
                      void signOut()
                    }}
                  >
                    {t.nav.logout}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
