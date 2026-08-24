/* ------------------------------------------------------------------ *
 * 목업 어댑터 — 실제 데이터가 붙기 전까지만 쓴다.
 * 이 폴더(src/adapters/mock/)를 통째로 지우고 registry.ts 의
 * 등록 두 줄을 빼면 깨끗하게 사라진다.
 * ------------------------------------------------------------------ */
import type { Departure, LegSpec, Place } from '../../engine/types'
import { at } from '../../engine/time'
import type { AdapterResult, LabeledRoute, RouteAdapter, RouteRequest } from '../types'
import { fail } from '../types'

const P = (name: string, code?: string): Place => ({ name, code })

const HOME = P('집')
const LOCAL = P('동네역', 'LOCAL')
const SEOUL = P('서울역', 'SEO')
const SUSEO = P('수서역', 'SRS')
const TERMINAL = P('센트럴시티터미널', 'CST')
const BUSAN = P('부산역', 'BSN')
const BUSAN_TERMINAL = P('부산종합버스터미널', 'BST')
const OFFICE = P('사무실')

const SOURCE = 'mock:korea'

/** 하루치 배차를 만든다. */
function everyMinutes(base: Date, from: string, to: string, gap: number): Departure[] {
  const out: Departure[] = []
  const start = at(base, from)
  const end = at(base, to)
  for (let t = start.getTime(); t <= end.getTime(); t += gap * 60_000) {
    out.push({ at: new Date(t) })
  }
  return out
}

/** 좌석 상태를 섞어 매진 시나리오를 만든다. null 은 조회 불가(KTX 계획표). */
function runs(
  base: Date,
  times: string[],
  carrier: (i: number) => string,
  seats: (boolean | null)[],
  bookingUrl: string,
): Departure[] {
  return times.map((t, i) => ({
    at: at(base, t),
    carrier: carrier(i),
    seat: { available: seats[i % seats.length], className: '일반실' },
    bookingUrl,
  }))
}

const KORAIL = 'https://www.letskorail.com/'
const KOBUS = 'https://www.kobus.co.kr/'

const walk = (from: Place, to: Place, durationMin: number): LegSpec => ({
  kind: 'walk',
  from,
  to,
  durationMin,
  confidence: 'estimated',
  source: SOURCE,
  origin: 'mock',
})

function baseRoute(base: Date): LegSpec[] {
  return [
    walk(HOME, LOCAL, 6),
    {
      kind: 'subway',
      from: LOCAL,
      to: SEOUL,
      durationMin: 26,
      departures: everyMinutes(base, '05:30', '23:50', 6),
      confidence: 'live',
      source: SOURCE,
      origin: 'mock',
    },
    {
      kind: 'train',
      from: SEOUL,
      to: BUSAN,
      durationMin: 167,
      departures: runs(
        base,
        ['06:00', '07:10', '08:35', '09:30', '10:40', '11:50', '13:00', '14:20', '16:00', '18:10'],
        (i) => `KTX ${101 + i * 2}`,
        [null], // KTX 는 계획 시간표만 — 좌석을 알 수 없다
        KORAIL,
      ),
      confidence: 'scheduled',
      source: SOURCE,
      origin: 'mock',
    },
    walk(BUSAN, OFFICE, 8),
  ]
}

function suseoRoute(base: Date): LegSpec[] {
  return [
    walk(HOME, LOCAL, 6),
    {
      kind: 'subway',
      from: LOCAL,
      to: SUSEO,
      durationMin: 34,
      departures: everyMinutes(base, '05:30', '23:50', 6),
      confidence: 'live',
      source: SOURCE,
      origin: 'mock',
    },
    {
      kind: 'train',
      from: SUSEO,
      to: BUSAN,
      durationMin: 158,
      departures: runs(
        base,
        ['06:20', '07:40', '08:50', '09:55', '11:10', '12:30', '14:00', '15:40', '17:20'],
        (i) => `SRT ${301 + i * 2}`,
        [true, false, true, true, false], // SRT 는 좌석 조회가 된다
        KORAIL,
      ),
      confidence: 'live',
      source: SOURCE,
      origin: 'mock',
    },
    walk(BUSAN, OFFICE, 8),
  ]
}

function busRoute(base: Date): LegSpec[] {
  return [
    walk(HOME, TERMINAL, 21),
    {
      kind: 'bus',
      from: TERMINAL,
      to: BUSAN_TERMINAL,
      durationMin: 265,
      departures: runs(
        base,
        ['06:30', '08:00', '09:40', '11:20', '13:10', '15:00'],
        () => '고속버스 우등',
        [true],
        KOBUS,
      ),
      confidence: 'live',
      source: SOURCE,
      origin: 'mock',
    },
    walk(BUSAN_TERMINAL, OFFICE, 24),
  ]
}

export const mockKoreaAdapter: RouteAdapter = {
  id: SOURCE,
  origin: 'mock',

  supports: (req) => req.fromCountry === 'KR' && req.toCountry === 'KR',

  // 목업은 서울↔부산 시나리오 하나만 손으로 짰다. 그 외 목적지를 부산으로
  // 슬쩍 바꿔치기하지 않는다 — 파서 가이드라인의 "모르면 추측하지 마라"를
  // 어댑터에서도 지킨다. 모르는 목적지는 정직하게 no-data 를 낸다.
  async route(req: RouteRequest): Promise<AdapterResult<LegSpec[]>> {
    if (!req.to?.name) return fail('no-data', SOURCE, '도착지를 알아내지 못했습니다')
    if (!req.to.name.includes('부산')) {
      return fail(
        'no-data',
        SOURCE,
        `이 목업은 "부산"행 경로만 알고 있습니다 (입력: "${req.to.name}")`,
      )
    }
    return { ok: true, data: baseRoute(req.around) }
  },

  async alternatives(req: RouteRequest): Promise<AdapterResult<LabeledRoute[]>> {
    return {
      ok: true,
      data: [
        { rung: 2, labelKey: 'fallback.station', specs: suseoRoute(req.around) },
        { rung: 3, labelKey: 'fallback.bus', specs: busRoute(req.around) },
      ],
    }
  },
}
