import { describe, expect, it } from 'vitest'
import { compareRoutes, type Rankable } from './rank'
import type { Leg } from './types'

const at = (hhmm: string) => new Date(`2026-09-05T${hhmm}:00+09:00`)

/** 구간을 간단히 짓는다. walk 는 도보, 나머지는 탑승. */
const leg = (kind: Leg['kind'], from: string, to: string): Leg =>
  ({
    kind,
    from: { name: 'a' },
    to: { name: 'b' },
    departAt: at(from),
    arriveAt: at(to),
    confidence: 'estimated',
  }) as Leg

/**
 * 2026-09-05, 대전 → 인천공항에서 실제로 나온 두 후보.
 * 순위가 환승·도보를 0원으로 치던 탓에 고단한 쪽이 이겼다.
 */
const 환승많은길: Rankable = {
  departAt: at('16:00'),
  arriveAt: at('20:57'),
  legs: [
    leg('walk', '16:00', '16:13'),
    leg('bus', '16:13', '16:55'),
    leg('walk', '16:55', '17:03'),
    leg('bus', '17:03', '18:29'),
    leg('walk', '18:29', '18:32'),
    leg('bus', '18:32', '19:35'),
    leg('walk', '19:35', '19:45'),
    leg('subway', '19:45', '20:52'),
    leg('walk', '20:52', '20:57'),
  ],
}
const 공항버스: Rankable = {
  departAt: at('15:25'),
  arriveAt: at('19:07'),
  legs: [
    leg('walk', '15:25', '15:28'),
    leg('bus', '15:28', '15:50'),
    leg('walk', '15:50', '15:53'),
    leg('bus', '15:53', '19:07'),
  ],
}

const first = (rs: Rankable[], mode: 'arriveBy' | 'departNow') =>
  [...rs].sort((a, b) => compareRoutes(a, b, mode))[0]

describe('경로 순위', () => {
  it('환승 3회·도보 39분보다 공항버스를 고른다 — 35분 일찍 나가더라도', () => {
    expect(first([환승많은길, 공항버스], 'arriveBy')).toBe(공항버스)
  })

  it('수고가 같으면 늦게 나가는 쪽이 이긴다 — 이 앱의 약속은 그대로다', () => {
    const 늦게 = { ...공항버스, departAt: at('16:00'), arriveAt: at('19:42') }
    expect(first([공항버스, 늦게], 'arriveBy')).toBe(늦게)
  })

  it('수고 차이가 작으면 여전히 출발 시각이 이긴다', () => {
    // 환승 한 번 차이(15분)보다 30분 늦게 나가는 쪽이 낫다
    const 조금고단하고늦게 = {
      departAt: at('16:00'),
      arriveAt: at('19:40'),
      legs: [leg('bus', '16:00', '17:00'), leg('walk', '17:00', '17:03'), leg('bus', '17:03', '19:40')],
    }
    const 편하고일찍 = {
      departAt: at('15:30'),
      arriveAt: at('19:10'),
      legs: [leg('bus', '15:30', '19:10')],
    }
    expect(first([조금고단하고늦게, 편하고일찍], 'arriveBy')).toBe(조금고단하고늦게)
  })

  it('지금 출발 모드는 도착이 빠른 쪽 — 규칙이 바뀌지 않았다', () => {
    expect(first([환승많은길, 공항버스], 'departNow')).toBe(공항버스)
  })

  it('정렬 비교자가 전순서다 — 어떤 순서로 넣어도 결과가 같다', () => {
    const a = first([환승많은길, 공항버스], 'arriveBy')
    const b = first([공항버스, 환승많은길], 'arriveBy')
    expect(a).toBe(b)
  })
})
