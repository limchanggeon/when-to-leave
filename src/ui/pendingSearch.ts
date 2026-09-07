import type { QueryInput } from './components/SearchPanel'

/**
 * 담에 막혀 못 한 조회를 기억해 둔다. 로그인하고 돌아오면 바로 돌린다.
 *
 * 로그인시키려고 흐름을 끊어놓고 "이제 처음부터 다시 입력하세요" 라고 하면
 * 끊은 값을 못 받는다. 하려던 일을 대신 마쳐줘야 로그인한 보람이 있다.
 *
 * **sessionStorage 를 쓴다.** 이건 방금 하려던 한 번의 일이지 취향이 아니다.
 * 탭을 닫으면 사라져야 맞고, 다른 탭에서 되살아나면 오히려 놀란다.
 */
const KEY = 'wtl_pending_search'

export function rememberSearch(q: QueryInput): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* 저장이 막혀 있으면 그냥 못 이어준다. 조회는 다시 입력하면 된다 */
  }
}

/** 꺼내면서 지운다 — 한 번만 이어준다. 새로고침마다 다시 돌면 안 된다. */
export function takeSearch(): QueryInput | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const q = JSON.parse(raw) as QueryInput
    // 저장된 모양을 믿지 않는다 — 판이 바뀌었으면 조용히 버린다
    return q && typeof q.to === 'string' && q.to ? q : null
  } catch {
    return null
  }
}
