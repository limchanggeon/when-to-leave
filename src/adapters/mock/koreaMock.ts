/* ------------------------------------------------------------------ *
 * 목업 어댑터 — 실제 데이터가 붙기 전까지만 쓴다.
 * 이 폴더(src/adapters/mock/)를 통째로 지우고 registry.ts 의
 * 등록 두 줄을 빼면 깨끗하게 사라진다.
 * ------------------------------------------------------------------ */
import type { Departure, LegSpec, Place } from '../../engine/types'
import { at } from '../../engine/time'
import type { AdapterResult, LabeledRoute, RouteAdapter, RouteRequest } from '../types'
import { fail } from '../types'

const P = (name: string, code: string | undefined, lat: number, lng: number): Place => ({
  name,
  code,
  lat,
  lng,
})

// 실제 좌표 — 지도에 찍히는 값이라 대충 넣으면 엉뚱한 곳에 표시된다.
const HOME = P('집', undefined, 37.5045, 127.0495)
const LOCAL = P('동네역', 'LOCAL', 37.5087, 127.0631)
const SEOUL = P('서울역', 'SEO', 37.5547, 126.9707)
const SUSEO = P('수서역', 'SRS', 37.4870, 127.1016)
const TERMINAL = P('센트럴시티터미널', 'CST', 37.5050, 127.0045)
const BUSAN = P('부산역', 'BSN', 35.1151, 129.0413)
const BUSAN_TERMINAL = P('부산종합버스터미널', 'BST', 35.2350, 129.0846)
const OFFICE = P('사무실', undefined, 35.1531, 129.0594)

const SOURCE = 'mock:korea'

/** 오늘부터 DAYS 일치 배차를 만든다. 하루치만 만들면 자정을 넘는 여정이 풀리지 않는다. */
const DAYS = 3

function eachDay(base: Date): Date[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    return d
  })
}

function everyMinutes(base: Date, from: string, to: string, gap: number): Departure[] {
  const out: Departure[] = []
  for (const day of eachDay(base)) {
    const start = at(day, from)
    const end = at(day, to)
    for (let t = start.getTime(); t <= end.getTime(); t += gap * 60_000) {
      out.push({ at: new Date(t) })
    }
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
  const out: Departure[] = []
  for (const day of eachDay(base)) {
    times.forEach((t, i) => {
      out.push({
        at: at(day, t),
        carrier: carrier(i),
        seat: { available: seats[i % seats.length], className: '일반실' },
        bookingUrl,
      })
    })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

const KORAIL = 'https://www.letskorail.com/'
const KOBUS = 'https://www.kobus.co.kr/'

/**
 * 요청받은 출발지를 쓴다. 좌표가 있으면 그대로 살려야 지도에 실제 위치가 찍힌다.
 * 이름만 있고 좌표가 없으면 기본 좌표(HOME)를 빌려 쓴다 — 목업이라 그만큼만 안다.
 */
function originOf(req: RouteRequest): Place {
  const from = req.from
  if (!from?.name) return HOME
  const hasCoords = typeof from.lat === 'number' && typeof from.lng === 'number'
  return hasCoords ? from : { ...HOME, name: from.name }
}

const walk = (from: Place, to: Place, durationMin: number): LegSpec => ({
  kind: 'walk',
  from,
  to,
  durationMin,
  confidence: 'estimated',
  source: SOURCE,
  origin: 'mock',
})

function baseRoute(base: Date, origin: Place): LegSpec[] {
  return [
    walk(origin, LOCAL, 6),
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

function suseoRoute(base: Date, origin: Place): LegSpec[] {
  return [
    walk(origin, LOCAL, 6),
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

function busRoute(base: Date, origin: Place): LegSpec[] {
  return [
    walk(origin, TERMINAL, 21),
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
    return { ok: true, data: baseRoute(req.around, originOf(req)) }
  },

  async alternatives(req: RouteRequest): Promise<AdapterResult<LabeledRoute[]>> {
    return {
      ok: true,
      data: [
        { rung: 2, labelKey: 'fallback.station', specs: suseoRoute(req.around, originOf(req)) },
        { rung: 3, labelKey: 'fallback.bus', specs: busRoute(req.around, originOf(req)) },
      ],
    }
  },
}
