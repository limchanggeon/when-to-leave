import { useEffect } from 'react'

/**
 * 화면마다 제목과 설명을 바꾼다.
 *
 * 한 페이지 안에서 주소만 바꾸는 방식이라(SPA), index.html 의 <title> 하나가
 * 모든 화면에 그대로 쓰인다. 그러면 검색 결과에 개인정보 처리방침이
 * "언제나가 — 출발 시각 역산" 이라는 제목으로 뜬다 — 실제로 그랬다.
 *
 * 구글은 자바스크립트를 돌린 뒤의 <title> 을 읽으므로 여기서 바꾸면 된다.
 * 화면을 벗어나면 되돌린다. 안 되돌리면 홈으로 돌아왔을 때 방침 제목이 남는다.
 */
const BASE_TITLE = '언제나가 — 출발 시각 역산'

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

export function usePageMeta(title: string | null, description?: string) {
  useEffect(() => {
    const prevTitle = document.title
    const prevDesc =
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? ''

    document.title = title ? `${title} — 언제나가` : BASE_TITLE
    if (description) setMeta('description', description)

    return () => {
      document.title = prevTitle
      if (description) setMeta('description', prevDesc)
    }
  }, [title, description])
}
