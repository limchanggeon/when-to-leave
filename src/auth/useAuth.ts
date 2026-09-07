import { useCallback, useEffect, useState } from 'react'
import { webStorage } from '../ui/storage'
import { fetchMe, serverLogout } from './api'
import { providers } from './providers'
import type { Account, AuthFailure, AuthResult, ProviderId } from './types'
import { clearFreeSearches } from '../ui/freeSearch'

export { providers }

const KEY = 'wtl.account'

/**
 * 로그인 상태. 지금은 계정 표시용 정보만 로컬에 둔다.
 *
 * 실서비스로 가면 토큰 검증과 세션은 서버가 맡아야 한다 —
 * localStorage 의 값은 사용자가 고칠 수 있으므로 권한 판단에 쓰면 안 된다.
 */
export function useAuth() {
  const [account, setAccount] = useState<Account | null>(null)
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const [busy, setBusy] = useState<ProviderId | null>(null)

  useEffect(() => {
    // 1) 로컬 값으로 먼저 그린다 (깜빡임 방지)
    const raw = webStorage.get(KEY)
    if (raw) {
      try {
        setAccount(JSON.parse(raw) as Account)
      } catch {
        webStorage.remove(KEY)
      }
    }
    // 2) 서버 세션이 진실이다. 로컬 값은 사용자가 고칠 수 있으므로 덮어쓴다.
    let cancelled = false
    fetchMe().then((server) => {
      if (cancelled || !server) return
      setAccount(server)
      webStorage.set(KEY, JSON.stringify(server))
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** 로그인 결과를 반영한다. 구글 공식 버튼처럼 콜백으로 결과가 오는 경우에도 쓴다. */
  const applyResult = useCallback((result: AuthResult) => {
    if (result.ok) {
      setAccount(result.account)
      setFailure(null)
      webStorage.set(KEY, JSON.stringify(result.account))
      // 무료 조회 기록을 지운다 — 로그아웃한 뒤 곧바로 담을 만나지 않게
      clearFreeSearches()
    } else {
      setFailure(result.failure)
    }
  }, [])

  const signIn = useCallback(
    async (id: ProviderId) => {
      const provider = providers.find((p) => p.id === id)
      if (!provider) return
      setBusy(id)
      setFailure(null)
      applyResult(await provider.signIn())
      setBusy(null)
    },
    [applyResult],
  )

  const signOut = useCallback(async () => {
    await serverLogout()
    if (account) await providers.find((p) => p.id === account.provider)?.signOut()
    setAccount(null)
    setFailure(null)
    webStorage.remove(KEY)
  }, [account])

  return { account, failure, busy, signIn, signOut, applyResult }
}
