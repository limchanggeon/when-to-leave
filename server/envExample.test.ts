import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * `.env.example` 은 저장소에 들어가고 저장소는 공개다. 여기에 값을 적으면
 * 그대로 세상에 나간다 — 실제로 초기 커밋에서 그랬다(710ebb5).
 *
 * 사람이 조심하는 것으로는 부족해서 시험으로 막는다.
 */
const text = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))

/**
 * 값이 있어도 되는 것들 — 비밀이 아니라 기본값이다.
 *
 * APP_API_BASE 는 앱이 볼 서버 주소다. 앱을 뜯으면 그대로 보이는 공개
 * 주소라 숨길 것이 없고, 오히려 적혀 있어야 다음 사람이 앱을 빌드할 수 있다.
 */
const ALLOWED = new Set(['AWS_REGION', 'MAIL_TRANSPORT', 'PUBLIC_ORIGIN', 'APP_API_BASE'])

describe('.env.example', () => {
  it('비밀값이 적혀 있지 않다', () => {
    const filled = lines
      .map((l) => l.split('=') as [string, ...string[]])
      .filter(([k, ...v]) => v.join('=').trim().length > 0 && !ALLOWED.has(k.trim()))
      .map(([k]) => k.trim())
    expect(filled).toEqual([])
  })

  it('코드가 읽는 변수를 빠짐없이 적어둔다', () => {
    const env = readFileSync(new URL('./env.ts', import.meta.url), 'utf8')
    const needed = [...env.matchAll(/req\('([A-Z_]+)'\)/g)].map((m) => m[1])
    const listed = new Set(lines.map((l) => l.split('=')[0].trim()))
    // GOOGLE_CLIENT_ID 처럼 VITE_ 쪽과 짝인 것도 각각 적혀 있어야 한다
    expect(needed.filter((k) => !listed.has(k))).toEqual([])
  })
})
