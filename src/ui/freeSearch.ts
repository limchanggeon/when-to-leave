/**
 * 로그인하지 않은 사람에게 주는 무료 조회 횟수.
 *
 * **브라우저에만 센다.** 서버에서 세려면 방문자를 알아볼 무언가(쿠키·IP)가
 * 있어야 하는데, 개인정보처리방침에 "IP 도 방문자 식별자도 쿠키도 쓰지
 * 않는다" 고 적어뒀다. 조회 수를 세자고 그 약속을 깨는 건 값이 안 맞는다.
 *
 * 그래서 이건 **막는 담이 아니라 안내판**이다. 저장소를 비우거나 시크릿
 * 창을 열면 다시 쓸 수 있다. 그래도 뜻은 있다 — 여기서 막히는 사람 대부분은
 * 우회할 생각이 아니라 가입할지 말지를 정하는 사람이다.
 *
 * 저장이 막힌 환경(사생활 보호 모드 등)에서는 **세지 않는다.** 세지 못해서
 * 못 쓰게 하는 것보다, 세지 못하면 그냥 쓰게 두는 편이 맞다.
 */
const KEY = 'wtl_free_searches'
export const FREE_LIMIT = 1

const read = (): number => {
  try {
    return Number(localStorage.getItem(KEY) ?? '0') || 0
  } catch {
    return 0
  }
}

/** 무료 조회를 다 썼는가. 저장을 못 읽으면 안 쓴 것으로 본다. */
export const usedUpFreeSearch = (): boolean => read() >= FREE_LIMIT

/** 한 번 썼다고 표시한다. 저장이 막혀 있으면 조용히 넘어간다. */
export function markFreeSearchUsed(): void {
  try {
    localStorage.setItem(KEY, String(read() + 1))
  } catch {
    /* 못 세면 안 센다 — 못 쓰게 하는 것보다 낫다 */
  }
}

/** 로그인하면 지운다. 로그아웃한 뒤 다시 담에 부딪히지 않게. */
export function clearFreeSearches(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 지우지 못해도 로그인한 사람에게는 담이 없다 */
  }
}
