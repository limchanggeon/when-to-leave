import { serverEnv } from './env'

export interface Mail {
  to: string
  subject: string
  /** 본문은 평문만 쓴다. HTML 메일은 스팸 판정과 렌더링 편차를 같이 떠안는다. */
  text: string
}

export type SendResult = { ok: true } | { ok: false; reason: string }

/**
 * 메일 발송.
 *
 * 실제 전송기는 아직 붙지 않았다(SES 도메인 인증과 샌드박스 해제가 먼저다).
 * 그때까지는 콘솔로 내보낸다 — 링크가 로그에 찍히므로 개발에서는 그걸
 * 눌러 전 과정을 돌려볼 수 있다.
 *
 * 운영에서 콘솔 전송기를 쓰고 있으면 메일이 **조용히 안 나간다.** 그건
 * 이 저장소가 제일 싫어하는 모양이라(없는 건 없다고 말한다),
 * missingServerEnv 가 /api/health 로 알려준다.
 */
export async function sendMail(mail: Mail): Promise<SendResult> {
  if (serverEnv.mailTransport === 'console') {
    console.log(
      [
        '',
        '─── 메일 (콘솔 전송기 — 실제로 나가지 않았습니다) ───',
        `받는 사람: ${mail.to}`,
        `제목: ${mail.subject}`,
        '',
        mail.text,
        '──────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
    return { ok: true }
  }

  // 여기에 SES(또는 SMTP) 전송기가 들어온다. 자격증명 없이 짜두면 검증할 수
  // 없는 코드가 운영에 나가므로, 붙일 때 실제로 보내보며 짠다.
  return { ok: false, reason: `알 수 없는 전송기: ${serverEnv.mailTransport}` }
}
