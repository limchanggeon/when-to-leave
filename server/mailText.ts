import { serverEnv } from './env'
import type { Mail } from './mail'

/**
 * 메일 본문.
 *
 * 화면 문구와 달리 언어를 고를 수가 없다 — 메일을 받는 시점에는 그 사람이
 * 어떤 화면을 쓰는지 알 수 없기 때문이다. 한국어로 쓰되, 링크 자체는
 * 어느 말을 쓰든 눌리므로 문제되지 않는다.
 */
const from = '언제나가'

const link = (token: string) =>
  `${serverEnv.publicOrigin}/api/auth/verify?token=${encodeURIComponent(token)}`

/** 가입한 사람에게 보내는 확인 링크. */
export function verifyMail(to: string, token: string): Mail {
  return {
    to,
    subject: `[${from}] 이메일 주소를 확인해 주세요`,
    text: [
      `${from} 가입을 마치려면 아래 주소를 눌러주세요.`,
      '',
      link(token),
      '',
      '이 링크는 24시간 동안만 쓸 수 있고, 한 번 누르면 만료됩니다.',
      '누르면 바로 로그인됩니다.',
      '',
      '가입한 적이 없다면 이 메일은 무시하셔도 됩니다 — 링크를 누르지 않으면',
      '아무 일도 일어나지 않습니다.',
    ].join('\n'),
  }
}

/**
 * 이미 가입된(그리고 확인된) 주소로 누군가 가입을 시도했을 때, **주인에게**
 * 보내는 알림.
 *
 * 가입 화면에는 "이미 가입된 주소" 라고 말하지 않는다. 그 응답 하나로
 * 어떤 주소가 가입돼 있는지 훑을 수 있기 때문이다. 대신 알아야 할 사람,
 * 즉 주인에게만 알린다.
 */
export function alreadyRegisteredMail(to: string): Mail {
  return {
    to,
    subject: `[${from}] 이미 가입된 주소로 가입 시도가 있었습니다`,
    text: [
      `이 주소(${to})로 ${from} 가입을 시도한 기록이 있습니다.`,
      '이미 가입돼 있어서 새로 만들어지지는 않았습니다.',
      '',
      '본인이 시도한 것이라면 그냥 로그인하시면 됩니다.',
      `  ${serverEnv.publicOrigin}/login`,
      '',
      '본인이 아니라면 아무것도 하지 않으셔도 됩니다. 다만 비밀번호를 다른',
      '곳과 같이 쓰고 있다면 이번 기회에 바꾸시길 권합니다.',
    ].join('\n'),
  }
}
