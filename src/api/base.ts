/**
 * 서버 주소를 붙이는 자리. **여기 하나뿐이다.**
 *
 * 웹에서는 화면과 API 가 같은 주소에 있어서 `/api/route` 로 충분했다.
 * 앱에서는 화면이 기기 안에 있고(https://localhost) 서버는 밖에 있어서,
 * 같은 코드가 https://localhost/api/route 를 부르며 아무 데도 닿지 않는다.
 *
 * 그래서 앱 빌드에만 VITE_API_BASE 를 준다. 값이 없으면 **아무 일도
 * 일어나지 않는다** — 웹 빌드는 예전과 한 글자도 다르지 않게 돈다.
 *
 * 호출부를 스무 곳 넘게 고치지 않고 경계에서 한 번에 붙이는 이유:
 * 나중에 누가 `fetch('/api/...')` 를 하나 더 써도 앱에서 조용히 안 되는 일이
 * 없어야 한다. 고치는 자리는 하나여야 한다.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

/** 이 요청이 우리 서버로 가는 것인지. 지도·폰트 같은 남의 주소는 건드리지 않는다. */
const ours = (url: string) => url.startsWith('/api/') || url === '/api'

/**
 * 서버 주소를 앞에 붙인다. 앱에서 한 번만 부른다(src/main.tsx).
 *
 * Capacitor 는 CapacitorHttp 로 fetch 를 네이티브 HTTP 에 넘긴다. 그쪽이
 * CORS 와 쿠키를 알아서 처리하므로 여기서는 **주소만** 채워주면 된다.
 */
export function installApiBase(): void {
  if (!API_BASE) return

  const original = globalThis.fetch
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string' && ours(input)) {
      return original(API_BASE + input, init)
    }
    // Request 객체로 주는 곳은 지금 없지만, 생겨도 조용히 새지 않게 한다
    if (input instanceof Request && ours(new URL(input.url, 'https://localhost').pathname)) {
      const path = new URL(input.url, 'https://localhost')
      return original(new Request(API_BASE + path.pathname + path.search, input), init)
    }
    return original(input, init)
  }
}
