import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { installApiBase } from './api/base'
import { startShell } from './native/shell'
import './ui/tokens.css'
import './ui/ui.css'

/*
 * 앱이면 서버 주소를 붙인다. 웹이면 아무 일도 하지 않는다.
 * **첫 요청(아래 /api/visit)보다 먼저** 해야 한다.
 */
installApiBase()

/*
 * 방문 한 번 알린다.
 *
 * 브라우저 세션당 한 번만 — sessionStorage 로 막는다. 쿠키도 식별자도 쓰지
 * 않으므로 이건 "순 방문자" 가 아니라 브라우저 세션 수다.
 *
 * 실패해도 아무 일 없다. 세는 일로 앱이 늦어지거나 깨지면 앞뒤가 바뀐다.
 */
try {
  if (!sessionStorage.getItem('wtl_visited')) {
    sessionStorage.setItem('wtl_visited', '1')
    void fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => {})
  }
} catch {
  /* 사생활 보호 모드 등에서 sessionStorage 가 막혀 있으면 그냥 넘어간다 */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * 앱 껍데기 준비(뒤로가기·상태바·스플래시). 그리기를 시작한 **뒤에** 부른다 —
 * 스플래시는 첫 그림이 나온 다음 내려야 흰 화면이 안 번쩍인다.
 * 웹에서는 아무 일도 하지 않는다.
 */
void startShell()
