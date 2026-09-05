import { serverEnv } from './env'
import type { Mail, SendResult } from './mail'
import { signRequest } from './sigv4'

/**
 * SES 로 메일 한 통 보내기 (SESv2 SendEmail).
 *
 * SDK 없이 HTTPS 로 직접 부른다 — 필요한 건 서명뿐이고 그건 sigv4.ts 가
 * 한다(AWS 공개 시험 벡터로 검증돼 있다).
 *
 * 실패를 던지지 않고 값으로 돌려준다. 메일이 안 나갔다고 가입 자체를
 * 깨뜨리면, 잠깐의 SES 장애가 서비스 전체를 멈추는 셈이 된다.
 * 못 보냈으면 못 보냈다고 남기고, 사용자는 "다시 보내기" 로 되돌아온다.
 */
export async function sendViaSes(mail: Mail): Promise<SendResult> {
  const { awsRegion: region, awsAccessKeyId, awsSecretAccessKey, mailFrom } = serverEnv
  if (!awsAccessKeyId || !awsSecretAccessKey) {
    return { ok: false, reason: 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 가 없습니다' }
  }
  if (!mailFrom) return { ok: false, reason: 'MAIL_FROM 이 없습니다' }

  const host = `email.${region}.amazonaws.com`
  const path = '/v2/email/outbound-emails'
  const body = JSON.stringify({
    FromEmailAddress: mailFrom,
    Destination: { ToAddresses: [mail.to] },
    Content: {
      Simple: {
        Subject: { Data: mail.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: mail.text, Charset: 'UTF-8' } },
      },
    },
  })

  const headers = signRequest({
    method: 'POST',
    path,
    headers: { host, 'content-type': 'application/json' },
    body,
    region,
    service: 'ses',
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  })

  try {
    const res = await fetch(`https://${host}${path}`, { method: 'POST', headers, body })
    if (res.ok) return { ok: true }

    /*
     * 실패 사유를 그대로 남긴다. SES 가 거절하는 이유는 대개 설정 문제라
     * (샌드박스, 미인증 주소, 서명 불일치) 본문에 답이 들어 있다.
     */
    const detail = await res.text().catch(() => '')
    return { ok: false, reason: `SES ${res.status}: ${detail.slice(0, 300)}` }
  } catch (e) {
    return { ok: false, reason: `SES 호출 실패: ${e instanceof Error ? e.message : String(e)}` }
  }
}
