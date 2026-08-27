/** 두 지점을 잇는 경로 — 히어로 일러스트와 같은 어휘를 쓴다. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M5 19c3-6 6.5-9 9-9s5 2 5 4-2.5 3.5-5.5 3.5S8 19.5 8 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="3 3.5"
      />
      <circle cx="5" cy="19" r="3" fill="currentColor" />
      <circle cx="22" cy="9" r="3" fill="currentColor" />
    </svg>
  )
}
