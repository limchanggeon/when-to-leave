import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from './useAuth'

type AuthValue = ReturnType<typeof useAuth>

const Ctx = createContext<AuthValue | null>(null)

/** 로그인 상태를 페이지 간에 공유한다 (상단바 ↔ 로그인 페이지). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuth()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuthContext(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider 안에서만 쓸 수 있습니다')
  return v
}
