import { serverEnv } from './env'
import { fetchJson } from './http'
import { geocode, type GeoPoint } from './geocode'
import type { RouteResult, WireLeg, WireRoute } from './routeTypes'
import { searchTransitKakao } from './kakaoTransit'
import { TAGO, tagoCall, trainsBetween } from './tago'
import {
  expressBusesBetween,
  flightsBetween,
  suburbsBusesBetween,
  type Run,
} from './tagoSchedules'

/**
 * 시외 경로를 직접 엮는다.
 *
 * 카카오 대중교통은 시내만 다루고(대전역→부산역은 NO_RESULTS),
 * TAGO 는 시각표만 줄 뿐 길찾기가 없다. 그래서 가운데를 우리가 잇는다:
 *
 *   출발지 --(카카오 시내)--> 역/터미널/공항 --(TAGO 시각표)--> 역/터미널/공항 --(카카오)--> 목적지
 *
 * 허브는 카카오 장소 검색으로 양 끝에서 가장 가까운 곳을 고른다.
 * 예전에 ODsay 가 통째로 해주던 일인데, 그 대신 어느 역을 쓸지에 대한
 * 판단을 우리가 지게 됐다. 가장 가까운 곳이 늘 최선은 아니다 —
 * 그래서 여러 수단을 다 뽑아 대안으로 함께 보여준다.
 */

const KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json'

type HubKind = 'train' | 'expressBus' | 'suburbsBus' | 'flight'

interface Hub {
  name: string
  lat: number
  lng: number
  distanceM: number
}

/**
 * 검색어와 걸러낼 규칙.
 *
 * 카테고리만 보면 안 된다 — "흑석리화물역" 은 카테고리가 그냥 "기차역" 이라
 * 통과해 버린다. 사람이 못 타는 곳은 이름에서만 드러나는 경우가 있다.
 */
/** `고속,시외버스터미널` 과 `고속,시외버스정류장` 을 함께 받는다. */
export const INTERCITY_STOP = /(고속|시외)[^>]*버스(터미널|정류장|정류소)/

const HUB_QUERY: Record<
  HubKind,
  { query: string; ok: (category: string, name: string) => boolean }
> = {
  train: {
    query: '기차역',
    ok: (c, n) => c.includes('기차역') && !/폐역|화물|신호장|기지/.test(`${c}${n}`),
  },
  /*
   * 카카오는 고속과 시외를 한 카테고리로 묶어둔다. 주차장·카셰어링이 섞여 나온다.
   *
   * **정류장도 받는다.** 예전에는 "버스터미널" 만 봤는데, 인천공항의 공항버스
   * 승차장은 카카오 분류가 `고속,시외버스정류장` 이라 통째로 걸러졌다.
   * 그래서 대전 → 인천공항을 물으면 공항버스가 후보에도 못 오르고, 카카오가
   * 엮어준 환승 3회짜리 시내 경로가 답이 됐다. TAGO 에는 그 터미널이
   * 멀쩡히 있다(시외 `인천공항2터미널`, 고속 `인천공항T1`).
   *
   * 앞에 고속·시외가 붙은 것만 받아 시내버스 정류장은 걸러낸다.
   * `[^>]*` 로 분류 경로의 다른 마디로 넘어가지 않게 막는다.
   */
  expressBus: { query: '고속버스터미널', ok: (c) => INTERCITY_STOP.test(c) },
  suburbsBus: { query: '시외버스터미널', ok: (c) => INTERCITY_STOP.test(c) },
  flight: { query: '공항', ok: (c, n) => c.includes('공항') && !/주차|화물/.test(`${c}${n}`) },
}

interface KeywordDoc {
  place_name?: string
  x?: string
  y?: string
  distance?: string
  category_name?: string
}

const hubCache = new Map<string, Hub[]>()

/**
 * 공항은 키워드 검색으로 못 찾는다.
 *
 * "공항" 으로 서울역 근처를 뒤지면 공항철도역과 도심공항터미널이 앞을 다 차지하고
 * 정작 김포공항은 밀려난다. 다행히 TAGO 가 주는 공항이 15곳뿐이라
 * 이름을 좌표로 한 번 바꿔두고 가까운 곳을 고르는 편이 확실하다.
 */
let airportsPromise: Promise<Hub[]> | null = null

function loadAirports(): Promise<Hub[]> {
  if (!airportsPromise) {
    airportsPromise = (async () => {
      const rows =
        (await tagoCall<{ airportNm?: string }>(TAGO.flight, 'GetArprtList', { numOfRows: '200' })) ??
        []
      const out: Hub[] = []
      for (const r of rows) {
        const name = r.airportNm?.trim()
        if (!name) continue
        const g = await geocode(name)
        if (g.ok) out.push({ name, lat: g.point.lat, lng: g.point.lng, distanceM: 0 })
      }
      console.log(`[intercity] 공항 좌표 ${out.length}곳`)
      return out
    })()
  }
  return airportsPromise
}

/** 공항까지는 멀어도 간다. 역·터미널보다 넉넉하게 본다. */
const AIRPORT_RANGE_M = 80_000

async function airportsNear(point: GeoPoint, limit: number): Promise<Hub[]> {
  const all = await loadAirports()
  return all
    .map((a) => ({ ...a, distanceM: metres(point, a) }))
    .filter((a) => a.distanceM <= AIRPORT_RANGE_M)
    .sort((x, y) => x.distanceM - y.distanceM)
    .slice(0, limit)
}

/** 두 지점 사이 거리(m). */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(p1) * Math.cos(p2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function hubsNear(point: GeoPoint, kind: HubKind, limit = 3): Promise<Hub[]> {
  if (kind === 'flight') return airportsNear(point, limit)

  const key = `${kind}:${point.lat.toFixed(3)},${point.lng.toFixed(3)}`
  const hit = hubCache.get(key)
  if (hit) return hit.slice(0, limit)

  const { query, ok } = HUB_QUERY[kind]
  const url =
    `${KEYWORD_URL}?query=${encodeURIComponent(query)}&x=${point.lng}&y=${point.lat}` +
    `&radius=20000&sort=distance&size=15`
  const res = await fetchJson<{ documents?: KeywordDoc[] }>(
    url,
    { headers: { Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` } },
    { label: '카카오 장소 검색' },
  )
  if (!res.ok) return []

  const found = (res.data.documents ?? [])
    .filter((d) => ok(d.category_name ?? '', d.place_name ?? ''))
    .map((d) => ({
      name: (d.place_name ?? '').trim(),
      lat: Number(d.y),
      lng: Number(d.x),
      distanceM: Number(d.distance ?? 0),
      /* 터미널인지 정류소인지. 카카오 분류가 그대로 알려준다. */
      isTerminal: /터미널/.test(d.category_name ?? ''),
    }))
    .filter((h) => h.name && Number.isFinite(h.lat) && Number.isFinite(h.lng))

  /*
   * 터미널을 정류소보다 앞세운다.
   *
   * 거리만으로 고르면 큰 터미널이 코앞의 작은 정류소들에 밀려난다. 실제로
   * 둔산동에서 인천공항을 물으면 시외 허브 세 자리를 대전청사 정류소 셋이
   * 차지해, 정작 공항버스가 다니는 대전복합터미널이 후보에 못 들었다.
   * 그래서 환승 세 번짜리 시내 경로가 답이 됐다.
   *
   * 정류소를 버리지는 않는다 — 인천공항의 공항버스 승차장이 바로 정류소라,
   * 빼면 도착 쪽 허브가 사라진다. 순서만 뒤에 둔다.
   */
  const hubs = found
    .slice()
    .sort((a, b) => Number(b.isTerminal) - Number(a.isTerminal) || a.distanceM - b.distanceM)
    /*
     * 같은 터미널의 동관·서관처럼 한 곳이 여러 줄로 오는 걸 접는다.
     * 안 접으면 세 자리를 한 터미널이 다 먹어 다른 후보가 사라진다.
     */
    .filter((h, i, all) => !all.slice(0, i).some((prev) => h.name.startsWith(prev.name)))

  hubCache.set(key, hubs)
  return hubs.slice(0, limit)
}

const LOOKUP: Record<HubKind, (a: string, b: string, from: Date) => Promise<Run[] | null>> = {
  train: async (a, b, from) => {
    const runs = await trainsBetween(a, b, from)
    return (
      runs?.map((r) => ({
        departAt: r.departAt,
        arriveAt: r.arriveAt,
        carrier: [r.grade, r.trainNo].filter(Boolean).join(' ').trim(),
        fare: r.fare,
      })) ?? null
    )
  },
  expressBus: (a, b, from) => expressBusesBetween(a, b, from),
  suburbsBus: (a, b, from) => suburbsBusesBetween(a, b, from),
  flight: (a, b, from) => flightsBetween(a, b, from),
}

const LEG_KIND: Record<HubKind, WireLeg['kind']> = {
  train: 'train',
  expressBus: 'bus',
  suburbsBus: 'bus',
  flight: 'flight',
}

/** 평균 소요시간(분). 시각표에서 뽑는다 — 구간 길이를 짐작하지 않는다. */
function medianMinutes(runs: Run[]): number {
  const spans = runs
    .map((r) => (new Date(r.arriveAt).getTime() - new Date(r.departAt).getTime()) / 60_000)
    .filter((m) => m > 0)
    .sort((x, y) => x - y)
  return spans.length ? Math.round(spans[Math.floor(spans.length / 2)]) : 60
}

/**
 * 허브까지 가는 구간. 시내 대중교통으로 풀고, 안 되면 만들지 않는다.
 * 없는 도보를 지어내느니 구간을 비우는 편이 낫다.
 */
async function connect(from: GeoPoint, to: GeoPoint): Promise<WireLeg[]> {
  const r = await searchTransitKakao(from, to)
  return r.ok && r.routes[0] ? r.routes[0].legs : []
}

export async function searchIntercity(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const kinds: HubKind[] = ['train', 'expressBus', 'suburbsBus', 'flight']
  const now = new Date()

  // 양 끝의 허브를 수단별로 한 번에 찾는다
  const ends = await Promise.all(
    kinds.map(async (kind) => ({
      kind,
      dep: await hubsNear(from, kind, 3),
      arr: await hubsNear(to, kind, 3),
    })),
  )

  // 시각표가 실제로 있는 조합만 남긴다
  const found: { kind: HubKind; dep: Hub; arr: Hub; runs: Run[] }[] = []
  for (const { kind, dep, arr } of ends) {
    outer: for (const a of dep) {
      for (const b of arr) {
        const runs = await LOOKUP[kind](a.name, b.name, now)
        if (runs?.length) {
          found.push({ kind, dep: a, arr: b, runs })
          break outer // 수단마다 하나면 충분하다
        }
      }
    }
  }

  if (found.length === 0) {
    return {
      ok: false,
      code: 'no-data',
      message: '이 구간을 잇는 열차·버스·항공편을 찾지 못했습니다',
    }
  }

  // 빠른 것부터. 접근 구간은 상위 두 개에만 붙인다(호출을 아낀다).
  found.sort((x, y) => medianMinutes(x.runs) - medianMinutes(y.runs))

  const routes: WireRoute[] = []
  for (const [i, cand] of found.entries()) {
    const depPoint: GeoPoint = { name: cand.dep.name, lat: cand.dep.lat, lng: cand.dep.lng }
    const arrPoint: GeoPoint = { name: cand.arr.name, lat: cand.arr.lat, lng: cand.arr.lng }

    const [access, egress] =
      i < 2
        ? await Promise.all([connect(from, depPoint), connect(arrPoint, to)])
        : [[], []]

    const middle: WireLeg = {
      kind: LEG_KIND[cand.kind],
      from: { name: cand.dep.name, lat: cand.dep.lat, lng: cand.dep.lng },
      to: { name: cand.arr.name, lat: cand.arr.lat, lng: cand.arr.lng },
      durationMin: medianMinutes(cand.runs),
      carrier: cand.runs[0]?.carrier,
      confidence: 'scheduled',
      fare: cand.runs[0]?.fare,
      runs: cand.runs,
      /*
       * 이 구간이 어느 시외 수단인지 남긴다.
       *
       * 여기서 안 남기면 kind 가 'bus' 라 시내버스와 구분이 사라진다.
       * 순위가 "장거리는 시외 수단으로" 를 지키려면 이 표시가 있어야 하고,
       * 실제로 이게 없어서 공항버스가 시내 환승 사슬에 계속 졌다.
       * (시각표는 여기서 이미 붙여 보내므로 withTimetables 는 이 구간을
       *  다시 조회하지 않는다 — runs 가 이미 차 있다.)
       */
      tagoKind: cand.kind,
    }

    const legs = [...access, middle, ...egress]
    routes.push({ legs, totalMin: legs.reduce((s, l) => s + l.durationMin, 0) })
  }

  return { ok: true, routes: routes.slice(0, 3) }
}
