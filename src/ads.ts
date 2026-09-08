/**
 * 지금 광고를 다는가.
 *
 * 애드센스 스크립트는 VITE_ADSENSE_CLIENT 가 있을 때만 페이지에 들어간다
 * (vite.config.ts). 그런데 **문구는 그걸 모르고 있었다** — 광고를 끈 뒤에도
 * 푸터는 "광고를 답니다" 라고 했고 개인정보처리방침은 광고 쿠키를 설명했다.
 * 안 하는 일을 한다고 적어둔 셈이라, 방침이 과하게 적힌 것이 된다.
 *
 * 같은 값 하나를 보게 해서 둘이 어긋나지 않게 한다.
 */
export const adsEnabled = Boolean(import.meta.env.VITE_ADSENSE_CLIENT)
