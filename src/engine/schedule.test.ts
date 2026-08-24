import { describe, expect, it } from 'vitest'
import { compact, solveBackward, solveForward } from './schedule'
import { DEFAULT_POLICY } from './buffer'
import { at } from './time'
import type { LegSpec } from './types'

const day = new Date('2026-08-24T00:00:00')
const P = (name: string) => ({ name })
const SRC = 'test'

function specs(): LegSpec[] {
  return [
    { kind: 'walk', from: P('집'), to: P('역'), durationMin: 6, confidence: 'estimated', source: SRC, origin: 'mock' },
    {
      kind: 'subway',
      from: P('역'),
      to: P('서울역'),
      durationMin: 26,
      departures: [
        { at: at(day, '07:40') },
        { at: at(day, '08:00') },
        { at: at(day, '08:20') },
      ],
      confidence: 'live',
      source: SRC,
      origin: 'mock',
    },
    {
      kind: 'train',
      from: P('서울역'),
      to: P('부산역'),
      durationMin: 167,
      departures: [{ at: at(day, '08:35') }, { at: at(day, '10:00') }],
      confidence: 'scheduled',
      source: SRC,
      origin: 'mock',
    },
    { kind: 'walk', from: P('부산역'), to: P('사무실'), durationMin: 8, confidence: 'estimated', source: SRC, origin: 'mock' },
  ]
}

describe('solveBackward', () => {
  it('propagates deadlines leg by leg — 설계 문서 예시와 동일한 결과', () => {
    const target = at(day, '11:30')
    const result = solveBackward(specs(), target, DEFAULT_POLICY)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [walk1, subway, train, walk2] = result.legs
    // 열차: 08:35발이 09:10 여유 안에서 목표(11:30)를 만족하는 가장 늦은 편
    expect(train.departAt).toEqual(at(day, '08:35'))
    // 여유 9분 → 앞 구간 데드라인은 08:26
    expect(train.deadline).toEqual(at(day, '08:26'))
    // 지하철은 08:26 이내 도착하는 가장 늦은 편(08:00발, 26분)
    expect(subway.departAt).toEqual(at(day, '08:00'))
    expect(subway.arriveAt).toEqual(at(day, '08:26'))
    // 도보는 여유 0분이므로 지하철 출발 시각이 곧 데드라인
    expect(walk1.departAt).toEqual(at(day, '07:54'))
    expect(walk2.arriveAt).toEqual(at(day, '11:30'))
  })

  it('탈 수 있는 편이 없으면 no-departure 실패를 낸다', () => {
    const target = at(day, '08:00') // 열차 08:35 조차 못 맞추는 이른 목표
    const result = solveBackward(specs(), target, DEFAULT_POLICY)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.reason).toBe('no-departure')
  })
})

describe('solveForward', () => {
  it('현재 시각 이후 가장 빠른 편을 골라 대기시간을 만든다', () => {
    const now = at(day, '07:45') // 도보 6분 → 07:51 역 도착, 07:40발 지하철은 이미 놓쳤다
    const result = solveForward(specs(), now, DEFAULT_POLICY)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [, subway] = result.legs
    expect(subway.departAt).toEqual(at(day, '08:00'))
    expect(subway.waitMin).toBe(9) // 07:51 역 도착 → 08:00 승차
  })
})

describe('compact', () => {
  it('마지막 연속 구간에 숨은 대기를 이산 구간 쪽으로 드러낸다', () => {
    // 목표를 아주 늦게 잡으면 역산은 마지막 도보를 목표 직전으로 밀어버린다.
    const target = at(day, '20:00')
    const solved = solveBackward(specs(), target, DEFAULT_POLICY)
    expect(solved.ok).toBe(true)
    if (!solved.ok) return

    const raw = solved.legs
    // 역산 그대로: 마지막 도보가 목표 시각에 딱 맞춰 끝난다
    expect(raw[raw.length - 1].arriveAt).toEqual(at(day, '20:00'))

    const tidy = compact(raw)
    // 정돈 후: 열차 도착(10:00+167분=12:47) 직후 도보 8분 → 12:55 실제 도착
    expect(tidy[tidy.length - 1].arriveAt).toEqual(at(day, '12:55'))
    // 첫 구간 출발 시각은 "언제 나가야 하는가"이므로 바뀌지 않는다
    expect(tidy[0].departAt).toEqual(raw[0].departAt)
  })
})
