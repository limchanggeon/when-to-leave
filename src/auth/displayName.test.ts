import { describe, expect, it } from 'vitest'
import { displayName } from './displayName'
import type { Account } from './types'

/*
 * 지어낸 주소가 화면에 새는 것을 막는다.
 *
 * 카카오가 이메일을 안 주면 서버가 kakao_<id>@social.local 로 계정을
 * 구분하는데, 그건 우리 사정이다. 앱 설정 화면에
 * "kakao_5059099689@social.local 님으로 로그인했습니다" 가 떴다.
 */
const acc = (o: Partial<Account>): Account => ({
  id: 'x', provider: 'kakao', name: null, email: null, avatarUrl: null, ...o,
})

describe('화면에 보일 이름', () => {
  it('이름이 있으면 이름', () => {
    expect(displayName(acc({ name: '홍길동', email: 'a@b.com' }))).toBe('홍길동')
  })

  it('실재하는 주소는 그대로 쓴다', () => {
    expect(displayName(acc({ email: 'a@b.com' }))).toBe('a@b.com')
  })

  it('지어낸 주소는 보여주지 않는다', () => {
    expect(displayName(acc({ email: 'kakao_5059099689@social.local' }))).toBe('카카오 계정')
    expect(displayName(acc({ provider: 'google', email: 'google_1@social.local' }))).toBe('구글 계정')
  })

  it('아무것도 없으면 어디로 들어왔는지만 말한다', () => {
    expect(displayName(acc({}))).toBe('카카오 계정')
  })
})
