import type { Account } from './types'

/**
 * 화면에 보일 이름.
 *
 * 소셜 제공자가 이메일을 안 줄 때가 있다(카카오는 검수 전이면 특히).
 * 그때 서버가 계정을 구분하려고 `kakao_5059099689@social.local` 같은 주소를
 * 지어내는데, **그건 우리 사정이지 사람 이름이 아니다.** 그대로 내보내면
 * 설정 화면에 "kakao_5059099689@social.local 님으로 로그인했습니다" 가 뜬다.
 * 실제로 그렇게 떴다.
 *
 * 이름이 있으면 이름, 실재하는 주소면 주소, 둘 다 없으면 어디로 들어왔는지만
 * 말한다. 지어낸 주소는 보여주지 않는다.
 */
const GENERATED = /@social\.local$/

export function displayName(account: Account): string {
  if (account.name) return account.name
  if (account.email && !GENERATED.test(account.email)) return account.email
  return account.provider === 'kakao' ? '카카오 계정' : '구글 계정'
}
