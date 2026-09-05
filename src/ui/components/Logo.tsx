/**
 * 심볼 — 멈춘 타이머와 출발 화살표.
 *
 * logo/ 의 워드마크에서 그림 부분만 가져왔다. 두 가지를 뺐다.
 *
 * 1. 어두운 둥근 판. 머리글은 이미 그 색(--night)이라 판 위에 같은 색 판을
 *    또 얹는 꼴이고, 밝은 푸터에서는 스티커처럼 뜬다. 파비콘처럼 홀로 서는
 *    자리에만 판이 필요하다(public/favicon.svg).
 * 2. 글자. 이름은 옆에 DOM 텍스트로 있어서 한국어·일본어가 저절로 바뀌고,
 *    SVG 안에 글자를 넣으면 그 폰트가 없는 기기에서 다른 글꼴로 떨어진다.
 *
 * 색은 currentColor 를 탄다 — 머리글에서는 호박색, 푸터에서는 잉크색이다.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="10 8 44 48" fill="none" aria-hidden="true">
      {/* 다 차지 않은 고리 — 남은 시간이 줄어드는 모양 */}
      <circle
        cx="32"
        cy="35"
        r="18"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="80 25"
        strokeLinecap="round"
      />
      <path d="M27 13h10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {/* 나가는 방향 */}
      <path d="M21 46 39 28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M29 28h10v10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
