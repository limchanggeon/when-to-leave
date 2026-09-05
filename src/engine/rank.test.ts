import { describe, expect, it } from 'vitest'
import { compareRoutes, type Rankable } from './rank'
import type { Leg } from './types'

/** 25시 이후는 다음날로 넘긴다 — 막차 끊긴 뒤를 그리려면 필요하다. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date('2026-09-05T00:00:00+09:00')
  d.setHours(h, m, 0, 0)
  return d
}

/** 구간을 간단히 짓는다. walk 는 도보, 나머지는 탑승. */
const leg = (kind: Leg['kind'], from: string, to: string, tagoKind?: Leg['tagoKind']): Leg =>
  ({
    kind,
    from: { name: 'a' },
    to: { name: 'b' },
    departAt: at(from),
    arriveAt: at(to),
    confidence: 'estimated',
    tagoKind,
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
    leg('bus', '15:53', '19:07', 'suburbsBus'), // 공항버스
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

  it('지금 출발 모드는 도착이 빠른 쪽', () => {
    expect(first([환승많은길, 공항버스], 'departNow')).toBe(공항버스)
  })

  it('정렬 비교자가 전순서다 — 어떤 순서로 넣어도 결과가 같다', () => {
    const a = first([환승많은길, 공항버스], 'arriveBy')
    const b = first([공항버스, 환승많은길], 'arriveBy')
    expect(a).toBe(b)
  })

  it('시외 수단이 조금 손해여도 이긴다', () => {
    // 46분 일찍 나가야 하지만 환승이 적고 훨씬 빨리 닿는다
    expect(first([환승많은길, 공항버스], 'arriveBy')).toBe(공항버스)
  })

  it('반나절을 잃으면서까지 시외 수단을 택하지는 않는다', () => {
    /*
     * 2026-09-05 에 실제로 물린 경우. 오후 4시 40분에 물었더니 "내일 새벽
     * 2시 40분에 나가세요" 가 나왔다 — 공항버스 막차가 16:05 에 끊겨 다음 편이
     * 다음날 첫차였는데, 오늘 21:37 에 닿는 길을 두고 9시간 늦게 도착하는 쪽을
     * 골랐다. 시외 우선을 **순서**로 못 박았던 탓이다. 순서는 크기를 못 본다.
     */
    const 내일첫차리무진: Rankable = {
      departAt: at('26:40'), // 내일 02:40
      arriveAt: at('30:40'), // 내일 06:40
      legs: [leg('bus', '26:40', '30:40', 'suburbsBus')],
    }
    const 오늘도착하는시내길: Rankable = {
      departAt: at('16:49'),
      arriveAt: at('21:37'),
      legs: [
        leg('bus', '16:49', '18:20'),
        leg('walk', '18:20', '18:30'),
        leg('bus', '18:30', '21:37'),
      ],
    }
    expect(first([내일첫차리무진, 오늘도착하는시내길], 'departNow')).toBe(오늘도착하는시내길)

    /*
     * arriveBy 는 여기서 확인하지 않는다. 그 모드에서는 후보가 전부 목표 시각
     * 안에 도착하도록 이미 걸러져 있어서(solveBackward), 9시간 늦게 닿는
     * 경로가 후보에 들어올 수 없다. 목표가 내일 아침이라면 내일 새벽에
     * 나가라는 답이 오히려 맞다 — "가장 늦게 나가도 되는 시각" 이니까.
     */
  })

  it('지금 출발 모드도 환승·도보를 센다', () => {
    // 예전에는 도착 시각만 봐서 1분 빨리 닿는 환승 3회짜리가 직행을 이겼다
    const 직행 = {
      departAt: at('16:00'),
      arriveAt: at('18:01'),
      legs: [leg('bus', '16:00', '18:01')],
    }
    const 환승세번 = {
      departAt: at('16:00'),
      arriveAt: at('18:00'),
      legs: [
        leg('bus', '16:00', '16:40'), leg('walk', '16:40', '16:50'),
        leg('bus', '16:50', '17:20'), leg('walk', '17:20', '17:30'),
        leg('bus', '17:30', '18:00'),
      ],
    }
    expect(first([환승세번, 직행], 'departNow')).toBe(직행)
  })

  it('시외 수단끼리는 기존 규칙대로 겨룬다', () => {
    const 늦게 = {
      departAt: at('16:00'),
      arriveAt: at('19:42'),
      legs: [leg('bus', '16:00', '19:42', 'expressBus')],
    }
    expect(first([공항버스, 늦게], 'arriveBy')).toBe(늦게)
  })

  it('시내끼리는 아무것도 달라지지 않는다', () => {
    const 시내A = { departAt: at('16:00'), arriveAt: at('17:00'), legs: [leg('bus', '16:00', '17:00')] }
    const 시내B = { departAt: at('15:30'), arriveAt: at('16:30'), legs: [leg('bus', '15:30', '16:30')] }
    expect(first([시내A, 시내B], 'arriveBy')).toBe(시내A)
  })
})
