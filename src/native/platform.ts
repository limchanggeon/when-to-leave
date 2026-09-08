/**
 * 지금 앱 안인지. **@capacitor/core 를 불러오지 않고** 판단한다.
 *
 * 그 꾸러미를 위에서 import 하면 웹 번들에도 그대로 실려 나간다 —
 * 처음에 그렇게 했다가 웹이 쓰지도 않을 코드로 gzip 3.7 kB 무거워졌다.
 * 웹에서 이 값은 늘 false 이고, 그 사실을 알아내는 데 남의 코드가 필요 없다.
 *
 * 앱에서는 네이티브 쪽이 화면을 띄우기 전에 window.Capacitor 를 심어준다.
 * 그러니 그게 있는지만 보면 된다.
 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

const cap = (): CapacitorGlobal | undefined =>
  (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor

export const isApp = (): boolean => cap()?.isNativePlatform?.() === true

export const platform = (): string => cap()?.getPlatform?.() ?? 'web'
