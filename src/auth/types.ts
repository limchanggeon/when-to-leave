/**
 * 로그인. 웹과 앱(RN)이 같은 인터페이스를 쓰도록 provider 로 감쌌다 —
 * 앱에서는 각 SDK 의 네이티브 구현으로 갈아 끼운다.
 */
export interface Account {
  id: string
  provider: ProviderId
  name: string | null
  email: string | null
  avatarUrl: string | null
  /** 관리자인지. /admin 링크를 보일지 여기서 갈린다. */
  isAdmin?: boolean
}

export type ProviderId = 'kakao' | 'google'

export type AuthFailure =
  /** 키/클라이언트 ID 가 .env 에 없다. */
  | { code: 'not-configured'; provider: ProviderId; envVar: string }
  /** 사용자가 팝업을 닫았다. */
  | { code: 'cancelled'; provider: ProviderId }
  /**
   * 카카오로 넘어가는 이동이 시작되지 않았다.
   *
   * 카카오 로그인은 팝업이 아니라 **이 페이지를 통째로 옮긴다.** 옮겨가면
   * 이 코드가 쓰일 일이 없고, 한참 기다려도 안 옮겨졌다면 무언가가 막은 것이다
   * (사파리의 이동 차단, 확장 프로그램 등).
   */
  | { code: 'redirect-blocked'; provider: ProviderId }
  /** SDK 스크립트를 못 불러왔다. */
  | { code: 'sdk-unavailable'; provider: ProviderId }
  | { code: 'failed'; provider: ProviderId; detail?: string }

export type AuthResult = { ok: true; account: Account } | { ok: false; failure: AuthFailure }

export interface AuthProvider {
  id: ProviderId
  label: string
  /** .env 에 키가 있어 로그인 버튼을 눌러볼 수 있는 상태인지. */
  configured: boolean
  signIn(): Promise<AuthResult>
  signOut(): Promise<void>
}

/** 외부 SDK <script> 를 한 번만 로드한다. */
const loaded = new Map<string, Promise<void>>()

const SCRIPT_TIMEOUT_MS = 8000

/**
 * 외부 SDK 스크립트 로드.
 *
 * 타임아웃이 반드시 필요하다. 요청이 멈추면 onload 도 onerror 도 오지 않아
 * 이 프라미스가 영영 안 끝나고, 호출부가 그 뒤에 걸어둔 타임아웃은
 * 시작조차 하지 못한다 — 화면은 "확인 중…" 에 갇힌다.
 *
 * 실패한 로드는 캐시에서 지워 다음 시도가 다시 해볼 수 있게 한다.
 */
export function loadScript(src: string, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<void> {
  const existing = loaded.get(src)
  if (existing) return existing

  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }
    const timer = setTimeout(
      () => finish(new Error(`스크립트 로드가 ${timeoutMs / 1000}초를 넘었습니다: ${src}`)),
      timeoutMs,
    )

    el.src = src
    el.async = true
    el.onload = () => finish()
    el.onerror = () => finish(new Error(`스크립트를 불러오지 못했습니다: ${src}`))
    document.head.appendChild(el)
  }).catch((e) => {
    loaded.delete(src)
    throw e
  })

  loaded.set(src, p)
  return p
}
