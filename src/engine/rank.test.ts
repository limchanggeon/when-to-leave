import { describe, expect, it } from 'vitest'
import {
  compareRoutes,
  dedupeRoutes,
  pickAlternatives,
  transferCount,
  walkMin,
  type Rankable,
} from './rank'
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

describe('목표를 못 맞춰 다시 푼 경우', () => {
  /*
   * 2026-09-05 에 실제로 물린 경우. 오후 4시 40분에 "21시까지 인천공항" 을
   * 물었더니 "내일 새벽 2시 40분에 나가세요" 가 나왔다.
   *
   * 21시까지 닿는 길이 아예 없어서 "지금 나가면 언제 도착" 으로 바꿔 풀었는데,
   * 순위는 여전히 "가장 늦게 나가는 것" 으로 매기고 있었다. 목표가 사라진
   * 뒤에도 그 규칙을 쓰면, 늦게 나갈수록 좋은 답이 되어 버린다.
   *
   * planTrip 이 이 경우 ranking 을 departNow 로 바꾼다. 여기서는 그 규칙이
   * 실제로 오늘 닿는 쪽을 고르는지만 확인한다.
   */
  it('다시 푼 뒤에는 빨리 닿는 쪽이 답이다', () => {
    const 내일첫차 = {
      departAt: at('26:40'),
      arriveAt: at('30:40'),
      legs: [leg('bus', '26:40', '30:40', 'suburbsBus')],
    }
    const 오늘도착 = {
      departAt: at('16:49'),
      arriveAt: at('21:37'),
      legs: [leg('bus', '16:49', '18:20'), leg('walk', '18:20', '18:30'), leg('bus', '18:30', '21:37')],
    }
    expect(first([내일첫차, 오늘도착], 'departNow')).toBe(오늘도착)
    // 목표가 살아 있었다면 늦게 나가는 쪽이 맞다 — 규칙 자체는 그대로다
    expect(first([내일첫차, 오늘도착], 'arriveBy')).toBe(내일첫차)
  })
})

/* ---------------- 대안 고르기 ---------------- */

/** 정류장 이름까지 지정하는 구간. 같은 길인지 가리는 데 쓴다. */
const seg = (
  kind: Leg['kind'],
  from: string,
  to: string,
  a: string,
  b: string,
  carrier?: string,
): Leg =>
  ({
    kind,
    from: { name: a },
    to: { name: b },
    departAt: at(from),
    arriveAt: at(to),
    confidence: 'estimated',
    carrier,
  }) as Leg

const route = (legs: Leg[]): Rankable => ({
  departAt: legs[0].departAt,
  arriveAt: legs[legs.length - 1].arriveAt,
  legs,
})

describe('같은 길 접기', () => {
  /*
   * 2026-09-05, 대전 → 인천공항에서 대안 셋이 전부 8366 → 5000,5005 였다.
   * 노선 번호만 다른 것을 서로 다른 선택지로 내놓고 있었다.
   */
  it('번호만 다르고 같은 정류장을 지나면 하나로 접는다', () => {
    const a = route([seg('bus', '09:00', '09:30', '대전역', '터미널', '611')])
    const b = route([seg('bus', '09:00', '09:30', '대전역', '터미널', '622')])
    const out = dedupeRoutes([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].legs[0].carrier).toBe('611, 622')
  })

  it('이미 여러 번호가 적힌 것에 더 얹어도 중복되지 않는다', () => {
    const a = route([seg('bus', '09:00', '09:30', '대전역', '터미널', '611, 622')])
    const b = route([seg('bus', '09:00', '09:30', '대전역', '터미널', '622')])
    expect(dedupeRoutes([a, b])[0].legs[0].carrier).toBe('611, 622')
  })

  /*
   * 타는 곳과 내리는 곳이 같아도 노선이 다르면 사이를 도는 길이 달라
   * 소요 시간이 달라진다(대전 603 과 312). 하나로 접어 "603이나 312" 라고
   * 말하면, 먼저 오는 것을 탄 사람이 안내보다 늦게 도착한다.
   */
  it('정류장이 같아도 걸리는 시간이 다르면 접지 않는다', () => {
    const 빠른것 = route([seg('bus', '09:00', '09:11', '목원대', '변동서로', '603')])
    const 느린것 = route([seg('bus', '09:00', '09:25', '목원대', '변동서로', '312')])
    const out = dedupeRoutes([빠른것, 느린것])
    expect(out).toHaveLength(2)
    expect(out[0].legs[0].carrier).toBe('603')
  })

  it('1분 차이는 같은 것으로 본다 — 카카오 값이 분 단위로 반올림돼 온다', () => {
    const a = route([seg('bus', '09:00', '09:11', '목원대', '변동서로', '603')])
    const b = route([seg('bus', '09:00', '09:12', '목원대', '변동서로', '601')])
    expect(dedupeRoutes([a, b])[0].legs[0].carrier).toBe('603, 601')
  })

  it('지나는 정류장이 다르면 접지 않는다 — 진짜 다른 길이다', () => {
    const a = route([seg('bus', '09:00', '09:30', '대전역', '터미널', '611')])
    const b = route([seg('bus', '09:00', '09:30', '대전역', '유성', '104')])
    expect(dedupeRoutes([a, b])).toHaveLength(2)
  })

  /*
   * 타는 구간이 같아도 걷는 양이 다르면 총 소요가 다르다. 번호를 얹을 자리도
   * 안 맞으므로 둘 다 남기고, 어느 쪽이 나은지는 축이 가린다.
   */
  it('걷는 구간이 다르면 둘 다 남긴다 — 번호를 억지로 합치지 않는다', () => {
    const a = route([
      seg('walk', '08:55', '09:00', '집', '대전역'),
      seg('bus', '09:00', '09:30', '대전역', '터미널', '611'),
    ])
    const b = route([seg('bus', '09:00', '09:30', '대전역', '터미널', '622')])
    const out = dedupeRoutes([a, b])
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.legs[r.legs.length - 1].carrier)).toEqual(['611', '622'])
  })
})

describe('대안 고르기', () => {
  const 고른것 = route([
    seg('bus', '09:00', '09:20', 'A', 'B', '1'),
    seg('walk', '09:20', '09:50', 'B', 'C'), // 도보 30분
    seg('bus', '09:50', '10:30', 'C', 'D', '2'),
    seg('bus', '10:30', '11:00', 'D', 'E', '3'), // 환승 2회
  ])
  const 환승적은길 = route([seg('train', '09:10', '11:00', 'A', 'E', 'KTX')])
  const 도보적은길 = route([
    seg('bus', '09:00', '09:20', 'A', 'X', '9'),
    seg('walk', '09:20', '09:25', 'X', 'Y'), // 도보 5분
    seg('bus', '09:25', '11:00', 'Y', 'E', '8'),
  ])

  it('축마다 하나씩만 고르고, 왜 고른지를 함께 준다', () => {
    const got = pickAlternatives(고른것, [고른것, 환승적은길, 도보적은길], 'arriveBy')
    expect(got.map((g) => g.axis)).toContain('fewest-transfers')
    expect(got.map((g) => g.axis)).toContain('least-walking')
  })

  it('고른 경로 자신은 대안에 넣지 않는다', () => {
    const got = pickAlternatives(고른것, [고른것], 'arriveBy')
    expect(got).toHaveLength(0)
  })

  /* 환승이 똑같은데 "최소 환승" 이라고 붙여 내놓으면 거짓말이 된다. */
  it('그 축에서 실제로 낫지 않으면 내놓지 않는다', () => {
    const 같은수고 = route([
      seg('bus', '09:00', '09:20', 'A', 'P', '7'),
      seg('walk', '09:20', '09:50', 'P', 'Q'),
      seg('bus', '09:50', '10:30', 'Q', 'R', '6'),
      seg('bus', '10:30', '11:00', 'R', 'E', '5'),
    ])
    const got = pickAlternatives(고른것, [고른것, 같은수고], 'arriveBy')
    expect(got.map((g) => g.axis)).not.toContain('fewest-transfers')
    expect(got.map((g) => g.axis)).not.toContain('least-walking')
  })

  it('한 경로가 두 축에서 이겨도 한 번만 나온다', () => {
    const 다좋은길 = route([seg('train', '09:10', '10:30', 'A', 'E', 'KTX')])
    const got = pickAlternatives(고른것, [고른것, 다좋은길], 'arriveBy')
    expect(got).toHaveLength(1)
  })
})

describe('수고 재기', () => {
  it('타는 구간이 n개면 환승은 n-1번', () => {
    expect(transferCount([seg('bus', '09:00', '09:20', 'A', 'B')])).toBe(0)
    expect(
      transferCount([
        seg('bus', '09:00', '09:20', 'A', 'B'),
        seg('walk', '09:20', '09:30', 'B', 'C'),
        seg('bus', '09:30', '10:00', 'C', 'D'),
      ]),
    ).toBe(1)
  })

  it('도보는 걷는 구간만 센다', () => {
    expect(
      walkMin([
        seg('walk', '09:00', '09:10', 'A', 'B'),
        seg('bus', '09:10', '10:00', 'B', 'C'),
        seg('walk', '10:00', '10:05', 'C', 'D'),
      ]),
    ).toBe(15)
  })
})
