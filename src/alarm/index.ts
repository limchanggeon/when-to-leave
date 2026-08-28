import { calendarProvider } from './calendarProvider'
import { androidClockProvider, iosAlarmKitProvider } from './nativeProviders'
import type { AlarmProvider } from './types'

export * from './types'
export { connectCalendar } from './calendarProvider'

/**
 * 등록된 알람 수단. 앞선 것부터 쓸 수 있는지 확인한다.
 *
 * 앱으로 감싸면 네이티브가 먼저 잡히고, 웹에서는 캘린더로 떨어진다.
 * 순서를 이렇게 둔 이유: 시계 알람이 캘린더 알림보다 확실하게 깨운다.
 */
const providers: AlarmProvider[] = [iosAlarmKitProvider, androidClockProvider, calendarProvider]

export async function availableProviders(): Promise<AlarmProvider[]> {
  const checks = await Promise.all(providers.map((p) => p.isAvailable()))
  return providers.filter((_, i) => checks[i])
}

/** 지금 환경에서 쓸 수 있는 첫 번째 수단. */
export async function primaryProvider(): Promise<AlarmProvider | null> {
  return (await availableProviders())[0] ?? null
}
