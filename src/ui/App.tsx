import { Suspense, lazy, useEffect, type ComponentType } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { PrefsProvider, usePrefs } from './PrefsContext'
import { HomePage } from './pages/HomePage'
import { AppTabs } from './components/AppTabs'
import { isApp } from '../native/platform'

/**
 * 홈 말고는 다 따로 떼어 나중에 받는다.
 *
 * 사람들은 길을 찾으러 온다. 첫 화면에 로그인·마이페이지·개인정보처리방침·
 * 관리 화면 코드까지 묶어 보내면, 그중 무엇도 안 열 사람이 그걸 다 기다린
 * 뒤에야 검색창을 본다. 홈은 그대로 두고(첫 화면이라 쪼개면 오히려 늦다)
 * 나머지는 그 화면으로 갈 때 받는다.
 *
 * 관리 화면은 여는 사람이 한 명뿐이라 특히 그렇다.
 */
const page = <T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const LoginPage = page(() => import('./pages/LoginPage'), 'LoginPage')
const KakaoCallbackPage = page(() => import('./pages/KakaoCallbackPage'), 'KakaoCallbackPage')
const MyPage = page(() => import('./pages/MyPage'), 'MyPage')
const PrivacyPage = page(() => import('./pages/PrivacyPage'), 'PrivacyPage')
const AdminPage = page(() => import('./pages/AdminPage'), 'AdminPage')
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage')

/**
 * 앱의 화면 이동 막대. 웹에서는 아무것도 그리지 않는다.
 *
 * 화면마다 따로 붙이지 않고 여기 한 번만 둔다 — 화면이 늘 때마다 빠뜨리면
 * 그 화면에서만 갈 곳이 없어진다. 설정 화면은 자기 것을 직접 그리므로
 * (탭 위에 여백을 따로 잡는다) 여기서는 뺀다.
 */
/**
 * 화면을 옮기면 맨 위부터 보여준다.
 *
 * 브라우저는 뒤로 갈 때 있던 자리를 되살려주지만, **앞으로 갈 때는
 * 그러면 안 된다.** 안 하면 홈을 끝까지 내려 보다가 설정 탭을 눌렀을 때
 * 설정 화면 중간이 나온다 — 실제로 그래서 계정 칸이 안 보였다.
 */
function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Tabs() {
  const { t } = usePrefs()
  // useLocation 이어야 화면을 옮길 때 다시 그려진다. window.location 은 안 바뀐다
  const { pathname } = useLocation()
  if (!isApp() || pathname === '/settings') return null
  return <AppTabs t={t} />
}

export default function App() {
  return (
    <BrowserRouter>
      <PrefsProvider>
        <AuthProvider>
          <ScrollTop />
          {/*
            * 받는 사이 빈 화면을 두지 않는다. 판을 그대로 두고 안쪽만
            * 비워야 화면이 덜컹거리지 않는다.
            */}
          <Suspense fallback={<div className="page" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/kakao/callback" element={<KakaoCallbackPage />} />
              <Route path="/me" element={<MyPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              {/* 앱에서만 여는 화면. 웹은 같은 내용을 머리와 발치가 나눠 들고 있다 */}
              <Route path="/settings" element={<SettingsPage />} />
              {/* 관리자가 아니면 서버가 404 를 준다 — 화면 자체는 누구나 열 수 있지만 아무것도 안 보인다 */}
              <Route path="/admin" element={<AdminPage />} />
              {/* 알 수 없는 경로는 홈으로 */}
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Suspense>
          <Tabs />
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  )
}
