import { describe, expect, it } from 'vitest'
import { signRequest } from './sigv4'

/*
 * AWS 가 문서에 실어둔 시험 벡터(get-vanilla).
 * 서명 계산이 규격과 한 글자라도 어긋나면 이 값이 안 나온다 —
 * 자격증명 없이 검증할 수 있는 유일한 지점이라 반드시 맞춰둔다.
 */
const VECTOR = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  now: new Date('2015-08-30T12:36:00Z'),
}

describe('SigV4', () => {
  it('AWS 시험 벡터(get-vanilla)의 서명을 그대로 재현한다', () => {
    const h = signRequest({
      ...VECTOR,
      method: 'GET',
      path: '/',
      query: '',
      headers: { host: 'example.amazonaws.com' },
      body: '',
    })
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    )
  })

  it('같은 입력이면 같은 서명이 나온다', () => {
    const args = {
      ...VECTOR,
      method: 'POST' as const,
      path: '/v2/email/outbound-emails',
      headers: { host: 'email.us-east-1.amazonaws.com', 'content-type': 'application/json' },
      body: '{"a":1}',
    }
    expect(signRequest(args).authorization).toBe(signRequest(args).authorization)
  })

  it('본문이 한 글자만 달라도 서명이 바뀐다', () => {
    const base = {
      ...VECTOR,
      method: 'POST' as const,
      path: '/',
      headers: { host: 'x.amazonaws.com' },
    }
    const a = signRequest({ ...base, body: '{"a":1}' }).authorization
    const b = signRequest({ ...base, body: '{"a":2}' }).authorization
    expect(a).not.toBe(b)
  })

  it('헤더 순서가 달라도 같은 서명이 나온다 — 정규화가 정렬하기 때문', () => {
    const base = { ...VECTOR, method: 'POST' as const, path: '/', body: '{}' }
    const a = signRequest({ ...base, headers: { host: 'x.com', 'content-type': 'application/json' } })
    const b = signRequest({ ...base, headers: { 'content-type': 'application/json', host: 'x.com' } })
    expect(a.authorization).toBe(b.authorization)
  })

  it('SignedHeaders 가 이름순으로 나열된다', () => {
    const h = signRequest({
      ...VECTOR,
      method: 'POST',
      path: '/',
      headers: { host: 'x.com', 'content-type': 'application/json' },
      body: '{}',
    })
    const signed = /SignedHeaders=([^,]+)/.exec(h.authorization)?.[1]
    expect(signed).toBe('content-type;host;x-amz-date')
  })
})
