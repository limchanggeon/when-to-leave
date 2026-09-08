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

/*
 * 한 번의 호출에 쓸 수 있는 전체 시간.
 *
 * 재시도 자체는 위 이유로 필요하지만, **매번 타임아웃까지 다 기다리는**
 * 경우가 문제였다. 4초 × 4회 = 16초를 한 호출이 혼자 쓸 수 있었고, 검색은
 * 호출 수십 개를 나란히 기다리므로 그중 하나만 그래도 검색 전체가 그만큼
 * 걸린다 — 부산역 → 해운대가 다른 때는 2.2초인데 한 번은 12.4초가 나왔다.
 * 호출 26번 중 하나가 멈춘 것이었다.
 *
 * 그래서 횟수 대신 시간으로 막는다. 안 붙는 IP 는 연결이 밀리초 만에
 * 실패하므로 네 번 다 시도할 수 있고(원래 노리던 경우), 상대가 느려서
 * 매번 타임아웃이 나는 경우에만 두 번에서 멈춘다.
 */
const DEFAULT_BUDGET_MS = 8000

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
  opts: { timeoutMs?: number; retries?: number; budgetMs?: number; label?: string } = {},
): Promise<HttpResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts.retries ?? DEFAULT_RETRIES
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const label = opts.label ?? '외부 서비스'

  const started = Date.now()
  let lastMessage = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    // 남은 예산보다 오래 기다리지 않는다. 예산을 다 썼으면 더 시도하지 않는다.
    const left = budgetMs - (Date.now() - started)
    if (left <= 0) break

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, left))
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
  // 예산을 다 써서 빠져나온 경우. 마지막으로 본 실패를 그대로 전한다.
  return {
    ok: false,
    kind: lastMessage.includes('오지 않았습니다') ? 'timeout' : 'network',
    message: lastMessage || `${label} 호출에 실패했습니다`,
  }
}
