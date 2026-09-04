import { describe, expect, it } from 'vitest'
import { countdownFace, clockText } from './countdownFace'

const T = {
  units: { hour: '시간', minute: '분' },
  countdownLabel: '출발까지',
  leaveNow: '지금 나가세요',
  overdueLabel: '출발 시각이 지났어요',
}
const min = (n: number) => n * 60_000

describe('countdownFace', () => {
  it('여유 있으면 남은 시간을 그대로 보여준다', () => {
    expect(countdownFace(min(46) + 11_000, T)).toEqual({
      urgency: 'relaxed',
      heading: '출발까지',
      value: '46:11',
    })
  })

  it('한 시간이 넘으면 시간·분으로, 그 아래는 초까지 센다', () => {
    expect(clockText(min(125), T.units)).toBe('2시간 5분')
    expect(clockText(min(4) + 7_000, T.units)).toBe('4:07')
  })

  it('임박해도 숫자는 사라지지 않는다 — 급한 것은 꼬리표가 말한다', () => {
    // 값 자리가 "지금 나가세요" 로 바뀌던 시절에는 5분 내내 화면이 멈춰 보였고,
    // 판에 걸린 출발 시각과도 어긋나 보였다.
    const face = countdownFace(min(4) + 12_000, T)
    expect(face.urgency).toBe('now')
    expect(face.heading).toBe('지금 나가세요')
    expect(face.value).toBe('4:12')
  })

  it('매초 값이 달라진다', () => {
    const a = countdownFace(min(3) + 9_000, T).value
    const b = countdownFace(min(3) + 8_000, T).value
    expect(a).not.toBe(b)
  })

  it('지난 뒤에는 지난 시간을 세되 음수 부호를 붙이지 않는다', () => {
    expect(countdownFace(-min(3) - 7_000, T)).toEqual({
      urgency: 'overdue',
      heading: '출발 시각이 지났어요',
      value: '3:07',
    })
  })
})
