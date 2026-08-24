/**
 * 로컬 저장 인터페이스. 웹은 localStorage, 나중에 RN 앱은 SecureStore/AsyncStorage로
 * 교체한다 — 엔진·어댑터는 이 인터페이스를 몰라야 하므로 ui 레이어에만 둔다.
 */
export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export const webStorage: KeyValueStore = {
  get(key) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null // 시크릿 모드 등에서 접근이 막힐 수 있다
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* 조용히 무시 — 저장 실패가 앱을 막으면 안 된다 */
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* noop */
    }
  },
}
