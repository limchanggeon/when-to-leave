// 시간대를 못 박는 모듈이 먼저 와야 한다 — 실제 서버와 같은 순서다.
import './timezone'
import { describe, expect, it } from 'vitest'
import { SERVER_TZ } from './timezone'
import { dailyTypeCode, hhmmss } from './tagoSchedules'

/*
 * 이 시험은 **UTC 서버에서 9시간 밀리던 버그**를 잡아둔다(2026-09-05).
 * TAGO 는 "0536" 처럼 한국 시각의 벽시계 숫자를 주는데, setHours 는 프로세스의
 * 지역 시간대를 따른다. 개발 노트북(KST)에서는 맞고 운영(UTC)에서는 틀렸다.
 * 그래서 여기서는 **결과를 절대 시각(ISO)으로** 확인한다 — 지역 시간대에
 * 기대던 시험이었다면 버그가 있는 채로도 통과했을 것이다.
 */
describe('서버 시간대', () => {
  it('한국 시각으로 못 박혀 있다', () => {
    expect(process.env.TZ).toBe(SERVER_TZ)
  })

  it('시각표의 벽시계 숫자를 한국 시각으로 읽는다', () => {
    const base = new Date('2026-09-05T12:00:00+09:00')
    // 05:36 KST = 전날 20:36 UTC. UTC 서버에서 밀리면 이 값이 안 나온다.
    expect(hhmmss('053600', base)?.toISOString()).toBe('2026-09-04T20:36:00.000Z')
    expect(hhmmss('0536', base)?.toISOString()).toBe('2026-09-04T20:36:00.000Z')
  })

  it('자정을 넘기는 25시 표기를 그대로 더한다', () => {
    const base = new Date('2026-09-05T12:00:00+09:00')
    // 25:10 = 다음날 01:10 KST = 그날 16:10 UTC
    expect(hhmmss('2510', base)?.toISOString()).toBe('2026-09-05T16:10:00.000Z')
  })

  it('요일을 한국 날짜로 센다 — 시각표가 평일·토·일로 갈린다', () => {
    // 2026-09-05 는 토요일. 한국 시각 00:30 은 UTC 로는 아직 금요일이다.
    expect(dailyTypeCode(new Date('2026-09-05T00:30:00+09:00'))).toBe('02')
    expect(dailyTypeCode(new Date('2026-09-06T00:30:00+09:00'))).toBe('03') // 일요일
    expect(dailyTypeCode(new Date('2026-09-07T00:30:00+09:00'))).toBe('01') // 월요일
  })

  it('잘못된 값에는 null 을 준다', () => {
    const base = new Date('2026-09-05T12:00:00+09:00')
    expect(hhmmss(undefined, base)).toBeNull()
    expect(hhmmss('12', base)).toBeNull()
  })
})
