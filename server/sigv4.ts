import { createHash, createHmac } from 'node:crypto'

/**
 * AWS 서명 버전 4.
 *
 * SDK 를 넣지 않고 직접 서명한다. @aws-sdk/client-sesv2 는 메일 한 통
 * 보내자고 끌어오기엔 크고, 여기 필요한 건 해시와 HMAC 뿐이라 node:crypto
 * 로 충분하다. 쿠키 파서를 직접 읽는 것과 같은 이유다.
 *
 * 규격: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 * 이 파일은 AWS 가 공개한 시험 벡터로 검증한다(sigv4.test.ts).
 */
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest()

export interface SignInput {
  method: string
  /** 경로. 이미 URL 인코딩된 상태여야 한다. */
  path: string
  /** 정렬된 질의 문자열. 없으면 빈 문자열. */
  query?: string
  headers: Record<string, string>
  body: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  /** 임시 자격증명일 때만. */
  sessionToken?: string
  /** 시험을 위해 주입한다. 실제로는 지금 시각. */
  now?: Date
}

/** 20260905T031200Z / 20260905 */
const stamps = (d: Date) => {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amzDate: iso, dateOnly: iso.slice(0, 8) }
}

/**
 * 서명해서 넣어야 할 헤더를 돌려준다.
 *
 * 원래 headers 를 고치지 않고 새 객체를 준다 — 호출부가 무엇이 더해졌는지
 * 볼 수 있어야 디버깅이 된다.
 */
export function signRequest(input: SignInput): Record<string, string> {
  const { amzDate, dateOnly } = stamps(input.now ?? new Date())

  const payloadHash = sha256(input.body)
  /*
   * x-amz-content-sha256 은 넣지 않는다. S3 는 요구하지만 SES 는 아니고,
   * 넣으면 AWS 가 공개한 시험 벡터를 그대로 재현할 수 없게 된다 —
   * 자격증명 없이 이 구현을 검증할 수 있는 유일한 방법이 그 벡터다.
   */
  const headers: Record<string, string> = {
    ...input.headers,
    'x-amz-date': amzDate,
    ...(input.sessionToken ? { 'x-amz-security-token': input.sessionToken } : {}),
  }

  /*
   * 정규 헤더는 이름을 소문자로, 값의 앞뒤 공백을 떼고, 이름순으로 정렬한다.
   * 여기서 순서가 어긋나면 서명이 통째로 틀린다.
   */
  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const signedHeaders = canonicalHeaders.map(([k]) => k).join(';')

  const canonicalRequest = [
    input.method,
    input.path,
    input.query ?? '',
    canonicalHeaders.map(([k, v]) => `${k}:${v}`).join('\n') + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateOnly}/${input.region}/${input.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')

  // 서명 키는 날짜 → 리전 → 서비스 → 종료자 순으로 네 번 HMAC 을 건다.
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateOnly)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, input.service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}
