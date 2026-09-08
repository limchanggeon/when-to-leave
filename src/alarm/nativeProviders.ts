import { platform } from '../native/platform'
import type { AlarmProvider, AlarmResult } from './types'

/**
 * 네이티브 알람들.
 *
 * 웹에서는 시스템 알람을 만들 방법이 없다(그런 API 가 없다). 앱으로 감싸면
 * 열리므로, 여기서 갈라 둔다 — 화면과 엔진은 어느 것이 쓰이는지 모른다.
 */
const unavailable = (message: string): AlarmResult => ({
  ok: false,
  failure: { code: 'unsupported', message },
})

/** android/app/src/main/java/kr/whenigo/app/ClockAlarmPlugin.java */
interface ClockAlarm {
  schedule(o: { hour: number; minute: number; label: string }): Promise<{ opened: boolean }>
}

/*
 * 부를 때 불러온다. 위에서 import 하면 @capacitor/core 가 웹 번들에도
 * 실려 나가는데, 웹에서는 이 provider 가 아예 쓰이지 않는다.
 */
const clockAlarm = async (): Promise<ClockAlarm> => {
  const { registerPlugin } = await import('@capacitor/core')
  return registerPlugin<ClockAlarm>('ClockAlarm')
}

/**
 * Android: 기기 시계 앱에 진짜 알람을 만든다.
 *
 * 캘린더 알림과 달리 무음 모드를 뚫고 울린다. 이 앱이 웹보다 나은 유일한
 * 점이고, 그래서 알람 수단 중 캘린더보다 앞에 둔다(index.ts).
 *
 * 시계 앱 화면이 한 번 뜬다. 건너뛸 수도 있지만 그러지 않는다 —
 * 만든 기억이 없는 알람이 새벽에 울리는 편보다, 몇 시인지 눈으로 보고
 * 저장하는 편이 낫다.
 */
export const androidClockProvider: AlarmProvider = {
  id: 'android-clock',
  label: '시계 알람',
  isAvailable: async () => platform() === 'android',
  /** 설치할 때 받는 권한이라 따로 허용받을 것이 없다. */
  needsSetup: async () => false,
  async schedule(req) {
    if (platform() !== 'android') {
      return unavailable('Android 앱에서만 시계 알람을 만들 수 있습니다 (브라우저에는 해당 API 가 없습니다)')
    }
    try {
      /*
       * 시각만 넘긴다. 시계 알람은 "몇 시 몇 분" 이지 날짜가 없다 —
       * 오늘 그 시각이 지났으면 시계 앱이 알아서 내일로 잡는다.
       */
      await (await clockAlarm()).schedule({
        hour: req.at.getHours(),
        minute: req.at.getMinutes(),
        label: req.title,
      })
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, failure: { code: 'failed', message } }
    }
  },
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
