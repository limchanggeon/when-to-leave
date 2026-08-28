/**
 * 출발 알람.
 *
 * 알람을 거는 방법은 플랫폼마다 다르다. 웹에서는 시스템 알람을 만들 방법이
 * 아예 없고(그런 API 가 없다), 앱으로 가면 양쪽 다 열린다.
 * 그래서 "무엇으로 알릴지" 를 provider 로 갈라 둔다 — 화면과 엔진은
 * 어느 것이 쓰이는지 몰라도 된다.
 *
 *   웹          구글 캘린더 일정 + 알림        (지금 구현됨)
 *   Android     AlarmClock.ACTION_SET_ALARM   시계 앱에 진짜 알람
 *   iOS 26+     AlarmKit                       무음·집중 모드를 뚫는 알람
 */
export interface AlarmRequest {
  /** 알람이 울려야 할 시각 = 집에서 나가야 할 시각. */
  at: Date
  title: string
  /** 여정 요약. 캘린더 본문이나 알람 라벨로 쓴다. */
  body: string
  /** 도착 시각. 캘린더 일정의 끝으로 쓴다. */
  until?: Date
  location?: string
  /** 몇 분 전에 미리 알릴지. 시스템 알람에는 해당 없다. */
  remindBeforeMin?: number[]
}

export type AlarmFailure =
  /** 이 플랫폼에서 지원하지 않는다(웹의 시스템 알람 등). */
  | { code: 'unsupported'; message: string }
  /** 아직 연결/권한이 없다. */
  | { code: 'not-connected'; message: string }
  | { code: 'failed'; message: string }

export type AlarmResult =
  | { ok: true; /** 만들어진 것을 열어볼 수 있는 링크(있다면). */ link?: string }
  | { ok: false; failure: AlarmFailure }

export interface AlarmProvider {
  id: 'google-calendar' | 'android-clock' | 'ios-alarmkit'
  /** 화면에 보일 이름. */
  label: string
  /** 지금 이 환경에서 쓸 수 있는지. */
  isAvailable(): Promise<boolean>
  /** 사용자가 연결/권한 허용을 해야 하는지. */
  needsSetup(): Promise<boolean>
  schedule(req: AlarmRequest): Promise<AlarmResult>
}
