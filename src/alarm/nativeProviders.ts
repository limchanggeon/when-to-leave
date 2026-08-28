import type { AlarmProvider, AlarmResult } from './types'

/**
 * 아직 구현되지 않은 네이티브 알람들.
 *
 * 웹에서는 시스템 알람을 만들 방법이 없다. 앱(Capacitor/React Native)으로
 * 감쌀 때 각 파일의 schedule() 만 채우면 나머지 코드는 그대로 동작한다.
 * 지금은 "이 환경에서는 못 쓴다" 를 정직하게 돌려준다.
 */
const unavailable = (message: string): AlarmResult => ({
  ok: false,
  failure: { code: 'unsupported', message },
})

/**
 * Android: AlarmClock.ACTION_SET_ALARM 인텐트로 시계 앱에 알람을 만든다.
 * EXTRA_SKIP_UI 를 주면 확인 화면 없이 바로 등록된다.
 * 매니페스트에 com.android.alarm.permission.SET_ALARM 이 필요하다.
 */
export const androidClockProvider: AlarmProvider = {
  id: 'android-clock',
  label: 'Android 시계 앱',
  isAvailable: async () => false,
  needsSetup: async () => true,
  schedule: async () =>
    unavailable('Android 앱에서만 시계 알람을 만들 수 있습니다 (브라우저에는 해당 API 가 없습니다)'),
}

/**
 * iOS 26+: AlarmKit.
 * 무음·집중 모드를 뚫고 울리며 잠금화면·다이나믹 아일랜드·애플워치에 표시된다.
 * 첫 등록 때 시스템 권한 창이 뜬다.
 */
export const iosAlarmKitProvider: AlarmProvider = {
  id: 'ios-alarmkit',
  label: 'iOS 알람 (AlarmKit)',
  isAvailable: async () => false,
  needsSetup: async () => true,
  schedule: async () =>
    unavailable('iOS 앱(iOS 26 이상)에서만 시스템 알람을 만들 수 있습니다'),
}
