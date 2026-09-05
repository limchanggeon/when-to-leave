import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { PrefsProvider } from './PrefsContext'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { KakaoCallbackPage } from './pages/KakaoCallbackPage'
import { MyPage } from './pages/MyPage'

/**
 * 관리 화면은 따로 떼어 나중에 받는다.
 *
 * 이 화면을 여는 사람은 관리자 한 명뿐인데, 묶어 두면 첫 방문자 모두가
 * 대시보드와 차트까지 내려받는다. 길 찾으러 온 사람이 쓰지 않을 코드다.
 */
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
)

export default function App() {
  return (
    <BrowserRouter>
      <PrefsProvider>
        <AuthProvider>
          <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/kakao/callback" element={<KakaoCallbackPage />} />
          <Route path="/me" element={<MyPage />} />
          {/* 관리자가 아니면 서버가 404 를 준다 — 화면 자체는 누구나 열 수 있지만 아무것도 안 보인다 */}
          <Route
            path="/admin"
            element={
              /* 받는 사이 빈 화면을 두지 않는다. 관리자는 이 화면을 자주 연다 */
              <Suspense fallback={<div className="page" aria-busy="true" />}>
                <AdminPage />
              </Suspense>
            }
          />
          {/* 알 수 없는 경로는 홈으로 */}
          <Route path="*" element={<HomePage />} />
          </Routes>
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  )
}
