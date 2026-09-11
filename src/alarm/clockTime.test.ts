import { describe, expect, it } from 'vitest'
import { clockTime } from './clockTime'

describe('기기 시계에 넘길 날짜', () => {
  const now = new Date(2026, 8, 11, 10, 30, 10)
  it('오늘 앞으로 올 시각은 설정한다', () => expect(clockTime(new Date(2026, 8, 11, 11), now)).toBeNull())
  it('지나간 시각이 내일 알람으로 바뀌지 않게 막는다', () => expect(clockTime(new Date(2026, 8, 11, 9), now)).toBe('past'))
  it('같은 분에 이미 지난 시각도 막는다', () => expect(clockTime(new Date(2026, 8, 11, 10, 30, 40), now)).toBe('past'))
  it('내일 아침은 다음 시계 알람과 같으므로 설정한다', () => expect(clockTime(new Date(2026, 8, 12, 9), now)).toBeNull())
  it('내일 오후를 오늘 오후로 잘못 등록하지 않는다', () => expect(clockTime(new Date(2026, 8, 12, 11), now)).toBe('date'))
  it('잘못된 날짜는 거부한다', () => expect(clockTime(new Date(NaN), now)).toBe('past'))
})
