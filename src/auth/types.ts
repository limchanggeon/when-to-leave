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
}

export type ProviderId = 'kakao' | 'google'

export type AuthFailure =
  /** 키/클라이언트 ID 가 .env 에 없다. */
  | { code: 'not-configured'; provider: ProviderId; envVar: string }
  /** 사용자가 팝업을 닫았다. */
  | { code: 'cancelled'; provider: ProviderId }
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

export function loadScript(src: string): Promise<void> {
  const existing = loaded.get(src)
  if (existing) return existing

  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`))
    document.head.appendChild(el)
  })
  loaded.set(src, p)
  return p
}
