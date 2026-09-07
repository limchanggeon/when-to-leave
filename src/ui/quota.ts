import { useEffect, useState } from 'react'

/**
 * 오늘 남은 조회 수.
 *
 * 헤더가 보여주고 홈이 갱신한다 — 조회는 홈에서 하고 표시는 헤더에서 하므로,
 * 둘을 잇는 자리가 필요하다. 문맥(Context)을 새로 두기에는 값 하나뿐이라
 * 모듈 안에 구독자 목록을 둔다.
 */
export interface Quota {
  tier: string
  used: number
  /** null 이면 제한 없음 — 그때는 화면에 아무것도 띄우지 않는다. */
  limit: number | null
  left: number | null
  label: string
}

const listeners = new Set<(q: Quota | null) => void>()
let current: Quota | null = null

/** 서버에서 다시 읽어 온다. 로그인하지 않았으면 null 이 된다. */
export async function refreshQuota(): Promise<void> {
  try {
    const res = await fetch('/api/me/quota', { credentials: 'include' })
    current = res.ok ? ((await res.json()) as Quota) : null
  } catch {
    // 못 읽었으면 없던 것으로 둔다. 숫자를 못 보여줄 뿐 쓰는 데는 지장 없다.
    current = null
  }
  for (const fn of listeners) fn(current)
}

export function useQuota(enabled: boolean): Quota | null {
  const [q, setQ] = useState<Quota | null>(current)

  useEffect(() => {
    if (!enabled) {
      current = null
      setQ(null)
      return
    }
    listeners.add(setQ)
    void refreshQuota()
    return () => {
      listeners.delete(setQ)
    }
  }, [enabled])

  return q
}
