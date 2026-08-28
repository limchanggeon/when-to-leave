import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { PrefsProvider } from './PrefsContext'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { KakaoCallbackPage } from './pages/KakaoCallbackPage'
import { MyPage } from './pages/MyPage'

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
          {/* 알 수 없는 경로는 홈으로 */}
          <Route path="*" element={<HomePage />} />
          </Routes>
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  )
}
