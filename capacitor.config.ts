import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 앱 화면이 자기를 어느 주소라고 말할지.
 *
 * 기기 안 파일을 그대로 띄우면 출처가 https://localhost 가 되는데, 그러면
 * **카카오 지도가 안 뜬다** — 지도 SDK 는 부르는 쪽 도메인을 콘솔에 등록된
 * 것과 맞춰보고, 안 맞으면 401 로 거절한다
 * ("domain mismatched! caller=https://localhost").
 *
 * localhost 를 콘솔에 등록해서 풀 수도 있지만, 그러면 누구든 자기 컴퓨터에서
 * https://localhost 를 띄워 우리 키를 쓸 수 있게 된다 — 도메인 검사가
 * 이 키를 지키는 유일한 수단이라 그걸 스스로 풀 이유가 없다.
 *
 * 그래서 앱 화면의 출처를 실제 도메인으로 맞춘다. 파일은 여전히 기기 안에서
 * 오고(네트워크를 안 탄다), 이름표만 같아진다.
 *
 * **서버와 같은 이름을 쓰면 안 된다.** 그러면 /api 요청이 같은 출처가 되어
 * 앱 안 서버가 가로채고 index.html 을 돌려준다 — 화면은 멀쩡한데 조회만
 * 조용히 안 되는 상태가 된다(실제로 그렇게 만들었다가 잡았다).
 * 그래서 서버 도메인 앞에 app. 을 붙인 이름을 쓴다. 실제로 존재하지 않아도
 * 된다 — 네트워크를 타지 않고 이름표로만 쓰인다.
 *
 * **카카오 콘솔 [플랫폼 > Web] 에 이 주소를 등록해야 한다.**
 * localhost 를 등록해서 풀 수도 있지만, 그러면 누구든 자기 컴퓨터에서
 * https://localhost 를 띄워 우리 키를 쓸 수 있다. 우리 도메인이면 그럴 수 없다.
 *
 * APP_API_BASE 에서 뽑아 쓴다 — 두 군데에 적어두면 도메인을 옮길 때
 * 한쪽만 고치게 된다.
 */
const apiBase = process.env.APP_API_BASE ?? 'https://whenigo.p-e.kr'
export const APP_HOSTNAME = `app.${new URL(apiBase).hostname}`

/**
 * 안드로이드·iOS 앱 껍데기.
 *
 * 화면은 웹과 **같은 코드**를 쓴다(dist/ 를 그대로 담는다). 앱이 웹보다
 * 나은 점은 화면이 아니라 **시스템 알람**이다 — 브라우저는 정해진 시각에
 * 사람을 깨울 방법이 없다. 그게 이 앱의 존재 이유이자, 구글이 "웹사이트
 * 복사본"(정책 4.3)으로 보지 않는 근거다.
 */
const config: CapacitorConfig = {
  /*
   * **한 번 올리면 영영 못 바꾼다.** 다른 값으로 바꾸려면 새 앱으로 올려야
   * 하고, 설치한 사람들과 리뷰가 전부 끊긴다. 살 도메인(whenigo.kr)을
   * 뒤집어 지었다.
   */
  appId: 'kr.whenigo.app',
  appName: '언제나가',
  webDir: 'dist',

  server: {
    /* 화면의 출처. 여기 파일을 네트워크에서 받아오는 것이 아니다 — 이름표만 바꾼다. */
    hostname: APP_HOSTNAME,
  },

  android: {
    /*
     * capacitor:// 로 두면 저장소·쿠키를 못 쓰는 브라우저 동작이 섞여 들어온다.
     * https 여야 위 hostname 과 합쳐져 https://<도메인> 이 된다.
     */
    androidScheme: 'https',
    // 섞인 http 를 막는다. 서버는 어차피 https 만 받는다.
    allowMixedContent: false,
  },

  plugins: {
    /*
     * fetch 를 네이티브 HTTP 로 돌린다.
     *
     * 앱 화면의 출처(https://localhost)와 서버(https://whenigo…)가 서로 다른
     * 사이트라, 브라우저 규칙 그대로면 CORS 에 막히고 세션 쿠키도 안 실린다.
     * 네이티브로 보내면 브라우저의 출처 검사를 거치지 않고 쿠키도 안드로이드
     * 쿠키 저장소가 들고 있으므로, **서버를 고칠 필요가 없다** —
     * SameSite=None 으로 풀어 웹까지 약하게 만들지 않아도 된다.
     */
    CapacitorHttp: { enabled: true },

    /*
     * 스플래시는 **우리가 내린다**(src/native/shell.ts).
     * 자동으로 두면 웹뷰가 첫 그림을 그리기 전에 사라져 흰 화면이 번쩍인다.
     */
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0C1A2B',
      androidSpinnerStyle: 'small',
      spinnerColor: '#FFFFFF',
    },
  },
}

export default config
