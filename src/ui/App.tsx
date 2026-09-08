import { Suspense, lazy, type ComponentType } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { PrefsProvider } from './PrefsContext'
import { HomePage } from './pages/HomePage'

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

export default function App() {
  return (
    <BrowserRouter>
      <PrefsProvider>
        <AuthProvider>
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
              {/* 관리자가 아니면 서버가 404 를 준다 — 화면 자체는 누구나 열 수 있지만 아무것도 안 보인다 */}
              <Route path="/admin" element={<AdminPage />} />
              {/* 알 수 없는 경로는 홈으로 */}
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  )
}
