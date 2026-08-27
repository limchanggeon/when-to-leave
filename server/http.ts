export type HttpResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: 'network' | 'timeout' | 'status'; status?: number; message: string }

/*
 * 카카오·ODsay 는 DNS 라운드로빈으로 요청마다 다른 IP 를 준다.
 * 그중 일부가 특정 네트워크에서 안 붙어 연결이 간헐적으로 멈춘다.
 *
 * 그래서 한 번에 오래 기다리기보다 **빨리 포기하고 다시 시도**하는 편이 낫다.
 * 재시도할 때 DNS 가 다시 풀리면서 대개 다른(붙는) IP 를 잡는다.
 */
const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_RETRIES = 3

/**
 * 외부 API 호출. 타임아웃과 재시도를 붙인다.
 *
 * 네트워크가 잠깐 끊기는 일은 흔한데, 그대로 두면 Node 가 "TypeError: fetch failed"
 * 만 던지고 이게 화면까지 그대로 올라간다. 사용자에게는 아무 뜻도 없는 문장이다.
 * 여기서 한 번 다시 시도해 보고, 그래도 안 되면 무엇이 안 됐는지 말이 되는
 * 메시지로 바꿔 돌려준다.
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number; label?: string } = {},
): Promise<HttpResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts.retries ?? DEFAULT_RETRIES
  const label = opts.label ?? '외부 서비스'

  let lastMessage = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)

      if (!res.ok) {
        // 4xx 는 재시도해도 같은 답이 온다. 5xx 만 다시 시도할 값어치가 있다.
        const body = await res.text().catch(() => '')
        const message = `${label} 응답 ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`
        if (res.status < 500 || attempt === retries) {
          return { ok: false, kind: 'status', status: res.status, message }
        }
        lastMessage = message
        continue
      }

      return { ok: true, status: res.status, data: (await res.json()) as T }
    } catch (e) {
      clearTimeout(timer)
      const aborted = e instanceof Error && e.name === 'AbortError'
      lastMessage = aborted
        ? `${label} 응답이 ${timeoutMs / 1000}초 안에 오지 않았습니다`
        : `${label}에 연결하지 못했습니다`
      if (attempt === retries) {
        return {
          ok: false,
          kind: aborted ? 'timeout' : 'network',
          message: `${lastMessage} (${retries + 1}회 시도)`,
        }
      }
    }
  }
  return { ok: false, kind: 'network', message: lastMessage || `${label} 호출에 실패했습니다` }
}
