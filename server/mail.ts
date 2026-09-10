import { serverEnv } from './env'
import { sendViaSes } from './ses'

export interface Mail {
  to: string
  subject: string
  /** 본문은 평문만 쓴다. HTML 메일은 스팸 판정과 렌더링 편차를 같이 떠안는다. */
  text: string
}

export type SendResult = { ok: true } | { ok: false; reason: string }

/**
 * 마지막으로 실패한 발송. `/api/health` 가 이걸 보여준다.
 *
 * 메일이 조용히 안 나가는 것이 이 저장소가 제일 싫어하는 모양인데,
 * 설정이 다 맞아도(전송기 ses, 키 있음, 보내는 주소 있음) 실패할 수 있다 —
 * SES 샌드박스, 한도 초과, 잠깐의 장애. 그건 환경변수 점검으로는 못 잡는다.
 * 그래서 실제로 실패한 사실을 들고 있다가 상태 화면에서 말한다.
 */
export let lastMailFailure: { at: number; reason: string } | null = null

/** 시험에서 상태를 비운다. */
export function clearMailFailure(): void {
  lastMailFailure = null
}

/**
 * 메일 발송.
 *
 * 운영은 SES 를 쓴다. 도메인 인증과 프로덕션 액세스(샌드박스 해제)가
 * 2026-09-10 에 끝나서, 인증되지 않은 주소로도 나간다 — 플러스 주소로
 * 확인했다(SES 는 그것을 별개 신원으로 본다).
 *
 * 개발에서는 콘솔 전송기를 쓴다. 링크가 로그에 찍히므로 그걸 눌러
 * 전 과정을 돌려볼 수 있고, 남의 편지함으로 시험 메일이 가지 않는다.
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

  if (serverEnv.mailTransport === 'ses') {
    const r = await sendViaSes(mail)
    // 못 보냈으면 로그에 남기고 상태에도 새긴다 — 조용히 사라지는 게 제일 나쁘다.
    if (!r.ok) {
      console.error(`[mail] 발송 실패 (${mail.to}): ${r.reason}`)
      lastMailFailure = { at: Date.now(), reason: r.reason }
    }
    return r
  }

  return { ok: false, reason: `알 수 없는 전송기: ${serverEnv.mailTransport}` }
}
