/**
 * 히어로 하단 일러스트 — 출발지에서 도착지로 이어지는 경로.
 * 이 제품의 주제(두 지점 사이의 시간)를 그대로 그린 것이라
 * 장식이 아니라 설명에 가깝다. 직접 그린 SVG다.
 */
export function RouteArt() {
  return (
    <svg className="hero__art" viewBox="0 0 1200 220" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      {/* 스카이라인 */}
      <g className="hero__art-city">
        <rect x="60" y="150" width="26" height="70" rx="2" />
        <rect x="96" y="128" width="20" height="92" rx="2" />
        <rect x="124" y="162" width="30" height="58" rx="2" />
        <rect x="1046" y="140" width="24" height="80" rx="2" />
        <rect x="1078" y="158" width="30" height="62" rx="2" />
        <rect x="1114" y="124" width="20" height="96" rx="2" />
      </g>

      {/* 경로선 */}
      <path
        className="hero__art-route"
        d="M232 168 C 400 168, 420 96, 600 96 S 800 168, 968 168"
        strokeLinecap="round"
      />

      {/* 출발 핀 */}
      <g className="hero__art-pin">
        <path d="M232 168c0-16 12-26 12-38a12 12 0 1 0-24 0c0 12 12 22 12 38z" />
        <circle className="hero__art-pin-eye" cx="232" cy="130" r="4.5" />
      </g>

      {/* 도착 핀 */}
      <g className="hero__art-pin hero__art-pin--end">
        <path d="M968 168c0-16 12-26 12-38a12 12 0 1 0-24 0c0 12 12 22 12 38z" />
        <circle className="hero__art-pin-eye" cx="968" cy="130" r="4.5" />
      </g>

      {/* 경로 위를 달리는 표식 */}
      <circle className="hero__art-dot" cx="600" cy="96" r="7" />
    </svg>
  )
}
