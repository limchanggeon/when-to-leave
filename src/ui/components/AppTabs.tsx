import { NavLink } from 'react-router-dom'
import type { I18nShape } from '../../i18n'
import { useAuthContext } from '../../auth/AuthContext'

/**
 * 앱의 화면 이동. **웹에는 없다.**
 *
 * 웹은 머리에 햄버거를 달고 있는데 그건 웹 관습이고, 6인치 화면 맨 위는
 * 엄지가 가장 닿기 어려운 자리다. 갈 곳이 셋뿐이라 아래에 늘어놓는 편이
 * 짧고 확실하다.
 *
 * **아이콘을 쓰지 않는다.** 이 앱의 얼굴은 발차 안내판이고 안내판에는
 * 그림이 없다 — 전부 글자다. 여기에만 아이콘 한 벌을 들이면 그 자리만
 * 다른 앱에서 가져온 것처럼 뜬다. 대신 고른 칸에 안내판이 쓰는 호박색
 * 표시를 준다(검색판의 "도착 시각 맞추기" 밑줄과 같은 문법이다).
 */
export function AppTabs({ t }: { t: I18nShape }) {
  const { account } = useAuthContext()

  const tabs = [
    { to: '/', label: t.appNav.route, end: true },
    // 로그인 전에는 갈 곳이 로그인 화면이다. 없는 마이페이지를 보여줘도 할 일이 없다
    account
      ? { to: '/me', label: t.nav.myPage, end: false }
      : { to: '/login', label: t.nav.login, end: false },
    { to: '/settings', label: t.appNav.settings, end: false },
  ]

  return (
    <nav className="apptabs" aria-label={t.appNav.tabs}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `apptabs__tab ${isActive ? 'is-on' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
