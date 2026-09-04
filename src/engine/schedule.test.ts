import { describe, expect, it } from 'vitest'
import { compact, solveBackward, solveForward } from './schedule'
import { DEFAULT_POLICY } from './buffer'
import { at } from './time'
import type { Leg, LegSpec } from './types'
import { compareRoutes, seatStateOf } from './rank'

const day = new Date('2026-08-24T00:00:00')
const P = (name: string) => ({ name })
const SRC = 'test'

function specs(): LegSpec[] {
  return [
    { kind: 'walk', from: P('집'), to: P('역'), durationMin: 6, confidence: 'estimated', source: SRC, origin: 'live' },
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
      origin: 'live',
    },
    {
      kind: 'train',
      from: P('서울역'),
      to: P('부산역'),
      durationMin: 167,
      departures: [{ at: at(day, '08:35') }, { at: at(day, '10:00') }],
      confidence: 'scheduled',
      source: SRC,
      origin: 'live',
    },
    { kind: 'walk', from: P('부산역'), to: P('사무실'), durationMin: 8, confidence: 'estimated', source: SRC, origin: 'live' },
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

describe('solveBackward — notBefore', () => {
  it('이미 지나간 편은 고르지 않는다', () => {
    // 목표 11:30 이면 08:35 열차가 답이지만, 지금이 09:00 이면 못 탄다.
    const now = at(day, '09:00')
    const result = solveBackward(specs(), at(day, '11:30'), DEFAULT_POLICY, now)
    expect(result.ok).toBe(false)
    if (result.ok) return
    // 제 시간에 닿는 편은 있었으나 전부 과거 → 목표 재협상 신호
    expect(result.failure.reason).toBe('too-late')
  })

  it('notBefore 이후 편이 남아 있으면 정상적으로 푼다', () => {
    const now = at(day, '05:00')
    const result = solveBackward(specs(), at(day, '11:30'), DEFAULT_POLICY, now)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.legs[0].departAt.getTime()).toBeGreaterThanOrEqual(now.getTime())
  })
})

describe('compareRoutes', () => {
  const leg = (seat: boolean | null): Leg => ({
    kind: 'train', discrete: true, from: P('A'), to: P('B'),
    departAt: at(day, '08:00'), arriveAt: at(day, '11:00'),
    bufferMin: 9, waitMin: 0, seat: { available: seat },
    confidence: 'live', source: SRC, origin: 'live',
  })
  const route = (depart: string, arrive: string, seat: boolean | null) => ({
    legs: [leg(seat)], departAt: at(day, depart), arriveAt: at(day, arrive),
  })

  it('도착 시각 모드에서는 늦게 나가도 되는 쪽이 이긴다', () => {
    const early = route('07:54', '11:30', null)
    const late = route('08:00', '11:36', true)
    expect(compareRoutes(late, early, 'arriveBy')).toBeLessThan(0)
  })

  it('지금 출발 모드에서는 빨리 도착하는 쪽이 이긴다', () => {
    const slow = route('08:00', '12:30', true)
    const fast = route('08:00', '11:36', null)
    expect(compareRoutes(fast, slow, 'departNow')).toBeLessThan(0)
  })

  it('매진은 아무리 늦게 나가도 뒤로 밀린다', () => {
    const soldOut = route('09:30', '11:50', false)
    const available = route('07:00', '11:00', true)
    expect(compareRoutes(available, soldOut, 'arriveBy')).toBeLessThan(0)
  })

  it('조회 불가(null)는 매진과 다르게 취급한다', () => {
    // KTX 는 늘 null 이라 매진 취급하면 영영 안 뽑힌다
    const unknown = route('09:30', '11:50', null)
    const available = route('07:00', '11:00', true)
    expect(compareRoutes(unknown, available, 'arriveBy')).toBeLessThan(0)
  })
})

describe('seatStateOf', () => {
  const bare = (): Leg => ({
    kind: 'train', discrete: false, from: P('A'), to: P('B'),
    departAt: at(day, '08:00'), arriveAt: at(day, '11:00'),
    bufferMin: 0, waitMin: 0, confidence: 'estimated', source: SRC, origin: 'live',
  })

  it('좌석 정보가 아예 없으면 unknown 이다', () => {
    // ODsay 는 좌석을 주지 않는다. 여기서 ok 를 내면 화면에
    // "좌석 있음"이라는 근거 없는 말이 뜬다.
    expect(seatStateOf([bare()])).toBe('unknown')
  })

  it('좌석이 확인되면 ok', () => {
    expect(seatStateOf([{ ...bare(), seat: { available: true } }])).toBe('ok')
  })

  it('하나라도 매진이면 sold-out', () => {
    expect(seatStateOf([{ ...bare(), seat: { available: true } }, { ...bare(), seat: { available: false } }]))
      .toBe('sold-out')
  })
})

describe('shapeRef', () => {
  it('구간의 선형 참조가 엔진을 그대로 통과한다', () => {
    // 지도는 이 참조를 보고 /api/lane 을 부른다. 엔진이 흘려버리면
    // 지도가 조용히 직선으로 되돌아가므로 눈에 잘 안 띈다.
    const withRef = specs().map((s, i) =>
      s.kind === 'walk' ? s : { ...s, shapeRef: { mapObj: '31218:1:17:30', index: i } },
    )
    const solved = solveBackward(withRef, at(day, '11:30'), DEFAULT_POLICY)
    expect(solved.ok).toBe(true)
    if (!solved.ok) return

    const refs = solved.legs.map((l) => l.shapeRef?.index)
    expect(refs).toEqual([undefined, 1, 2, undefined])
    expect(solved.legs[1].shapeRef?.mapObj).toBe('31218:1:17:30')

    // compact 를 거쳐도 남아야 한다
    expect(compact(solved.legs)[2].shapeRef?.index).toBe(2)
  })
})
