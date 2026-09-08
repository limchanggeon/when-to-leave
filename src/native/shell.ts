import { isApp, platform } from './platform'

/**
 * 앱 껍데기가 해줘야 하는 일들. 웹에서는 전부 아무 일도 하지 않는다.
 *
 * 구글은 웹사이트를 그대로 감싸기만 한 앱을 거절한다(정책 4.3, "최소 기능").
 * 알맹이는 시계 알람이지만(src/alarm/nativeProviders.ts), 앱으로서 당연히
 * 되어야 하는 것들이 안 되면 그것만으로도 걸린다 — 뒤로가기를 눌렀더니
 * 앱이 그냥 꺼지고, 지하철에서 열었더니 흰 화면만 나오는 것들이다.
 */
export { isApp }

/**
 * 안드로이드 하드웨어 뒤로가기.
 *
 * 안 붙이면 **어느 화면에서 누르든 앱이 그냥 꺼진다.** 마이페이지를 보다가
 * 뒤로 가려던 사람이 앱 밖으로 튕겨 나간다. 웹에서는 브라우저가 해주던 일이라
 * 앱에서만 티가 난다.
 *
 * **이벤트가 주는 canGoBack 은 쓰지 않는다.** 그 값은 웹뷰의 *페이지* 이력을
 * 말하는데, 이 앱은 한 페이지 안에서 주소만 바꾸는 방식이라(React Router)
 * 화면을 몇 번을 옮겨도 늘 false 로 온다 — 에뮬레이터에서 /login 에 서서
 * 눌러보니 {canGoBack:false} 였고, 같은 순간 history.back() 은 멀쩡히
 * 홈으로 돌아갔다. 그 값을 믿으면 뒤로가기가 통째로 죽는다.
 *
 * 그래서 우리가 아는 것으로 판단한다: 홈이 아니면 뒤로, 홈이면 앱을 내린다
 * (끄지 않는다 — 안드로이드에서 뒤로가기로 앱을 죽이면 다시 열 때 처음부터 뜬다).
 */
export async function installBackButton(): Promise<void> {
  if (!isApp()) return
  const { App } = await import('@capacitor/app')
  await App.addListener('backButton', () => {
    if (window.location.pathname === '/') {
      void App.minimizeApp()
      return
    }
    /*
     * 알림이나 링크로 곧장 들어와 돌아갈 이력이 없는 경우가 있다.
     * 그때 back() 을 부르면 아무 일도 안 일어나 사람이 갇힌다 — 홈으로 보낸다.
     */
    if (window.history.length > 1) window.history.back()
    else window.location.replace('/')
  })
}

/**
 * 화면이 준비되면 스플래시를 내린다.
 *
 * 자동으로 내리게 두면 웹뷰가 첫 그림을 그리기 전에 사라져 흰 화면이 한 번
 * 번쩍인다. capacitor.config.ts 에서 자동 내림을 끄고 여기서 내린다.
 */
export async function hideSplash(): Promise<void> {
  if (!isApp()) return
  const { SplashScreen } = await import('@capacitor/splash-screen')
  await SplashScreen.hide()
}

/** 상태바를 판 색에 맞춘다. 안 맞추면 검은 띠가 남는다. */
export async function paintStatusBar(): Promise<void> {
  if (platform() !== 'android') return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  try {
    await StatusBar.setBackgroundColor({ color: '#0C1A2B' }) // index.html 의 theme-color 와 같은 값
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    /* 기기에 따라 못 바꾸는 경우가 있다. 색이 안 맞는 것으로 끝나야지 앱이 죽으면 안 된다 */
  }
}

/** 앱에서만 하는 준비. 웹에서는 즉시 끝난다. */
export async function startShell(): Promise<void> {
  if (!isApp()) return
  await Promise.all([installBackButton(), paintStatusBar()])
  await hideSplash()
}
