/**
 * 카카오 로그인 버튼 — 공식 디자인 가이드 규격에 맞춘 구현.
 *   배경 #FEE500 / 심볼·텍스트 #000000(텍스트 85% 투명도) / 모서리 12px
 *   문구 "카카오 로그인" · 심볼 없는 구성 불가
 *
 * ⚠ 아래 말풍선은 규격에 맞춰 그린 SVG다. 가이드는 심볼의 형태·비율·색상
 *   변경을 금지하므로, **배포 전 카카오가 제공하는 공식 에셋(PNG/PSD)으로
 *   교체**하는 편이 안전하다. 이 자리만 바꾸면 된다.
 */
export function KakaoLoginButton({
  onClick,
  disabled,
  label = '카카오 로그인',
}: {
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button className="kakao-btn" type="button" onClick={onClick} disabled={disabled}>
      <svg className="kakao-btn__symbol" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#000000"
          d="M9 1.5C4.86 1.5 1.5 4.14 1.5 7.4c0 2.09 1.38 3.92 3.46 4.96-.15.55-.55 2-.63 2.31-.1.39.14.38.3.28.13-.08 2.04-1.39 2.87-1.95.49.07 1 .11 1.5.11 4.14 0 7.5-2.64 7.5-5.9S13.14 1.5 9 1.5z"
        />
      </svg>
      <span className="kakao-btn__label">{label}</span>
    </button>
  )
}
