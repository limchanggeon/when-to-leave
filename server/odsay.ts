import { serverEnv } from './env'
import { fetchJson } from './http'
import type { GeoPoint } from './geocode'

const PATH_URL = 'https://api.odsay.com/v1/api/searchPubTransPathT'

/** 클라이언트로 넘길 구간. JSON 으로 안전한 값만 담는다(시각은 ISO 문자열). */
export interface WireLeg {
  kind: 'walk' | 'subway' | 'bus' | 'train' | 'flight'
  from: { name: string; lat?: number; lng?: number }
  to: { name: string; lat?: number; lng?: number }
  durationMin: number
  carrier?: string
  confidence: 'live' | 'scheduled' | 'estimated'
  /**
   * 평균 배차 간격(분)과 하루 운행 편수.
   *
   * ODsay 는 **시각표를 주지 않는다.** 문서에는 startDateTime 이 있다고
   * 적혀 있지만 실제 응답에는 오지 않았고, 대신 이 두 값이 온다.
   * 그래서 구간은 연속 구간으로 두되, 배차 간격만큼 기다릴 수 있다는 사실은
   * 화면에 알린다. 진짜 시각표는 별도 소스가 붙어야 한다.
   */
  frequencyMin?: number
  runsPerDay?: number
  fare?: number
  /** 특실 운영 여부(기차). */
  premiumSeat?: boolean
}

export interface WireRoute {
  legs: WireLeg[]
  totalMin: number
}

export type RouteResult =
  | { ok: true; routes: WireRoute[] }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'network' | 'upstream-error'; message: string }

/** 시내: 1=지하철 2=버스 3=도보 / 시외: 4=기차 5=고속버스 6=시외버스 7=항공 */
const TRAFFIC: Record<number, WireLeg['kind']> = {
  1: 'subway',
  2: 'bus',
  3: 'walk',
  4: 'train',
  5: 'bus',
  6: 'bus',
  7: 'flight',
}

/**
 * trainType. 1~3 은 ODsay 문서 기준이고, 8 은 실제 응답에서 관측했다
 * (수서 → 부산 이 8 로 오는데 수서발 고속열차는 SRT 뿐이다).
 * 모르는 값은 지어내지 않고 그냥 "기차" 로 둔다.
 */
const TRAIN_TYPE: Record<number, string> = { 1: 'KTX', 2: '새마을', 3: '무궁화', 8: 'SRT' }

interface OdsaySubPath {
  trafficType: number
  sectionTime?: number
  startName?: string
  endName?: string
  startX?: number
  startY?: number
  endX?: number
  endY?: number
  lane?: { name?: string; busNo?: string }[]
  trainType?: number
  payment?: number
  intervalTime?: number
  intervalCount?: number
  trainSpSeatYn?: string
}

interface OdsayResponse {
  error?: { code?: string; message?: string; msg?: string }
  result?: { path?: { info?: { totalTime?: number }; subPath?: OdsaySubPath[] }[] }
}

function carrierOf(sub: OdsaySubPath): string | undefined {
  if (sub.trafficType === 4) {
    const type = sub.trainType ? TRAIN_TYPE[sub.trainType] : undefined
    return type ?? '기차'
  }
  if (sub.trafficType === 5) return '고속버스'
  if (sub.trafficType === 6) return '시외버스'
  if (sub.trafficType === 7) return '항공'
  const lane = sub.lane?.[0]
  return lane?.name ?? lane?.busNo
}

function toLegs(subPaths: OdsaySubPath[], from: GeoPoint, to: GeoPoint): WireLeg[] {
  return subPaths
    .filter((sub) => (sub.sectionTime ?? 0) > 0)
    .map((sub, i, arr) => {
      // 모르는 trafficType 이 와도 구간을 통째로 버리지 않는다.
      // 다만 무엇인지 모른다는 사실은 carrier 로 남긴다.
      const kind = TRAFFIC[sub.trafficType] ?? 'bus'
      return {
        kind,
        from: {
          name: sub.startName || (i === 0 ? from.name : '경유지'),
          lat: sub.startY,
          lng: sub.startX,
        },
        to: {
          name: sub.endName || (i === arr.length - 1 ? to.name : '경유지'),
          lat: sub.endY,
          lng: sub.endX,
        },
        durationMin: sub.sectionTime ?? 0,
        carrier: kind === 'walk' ? undefined : carrierOf(sub),
        // 시각표가 아니라 평시 소요시간이므로 실시간이라고 말하지 않는다
        confidence: 'estimated',
        frequencyMin: sub.intervalTime,
        runsPerDay: sub.intervalCount,
        fare: sub.payment,
        premiumSeat: sub.trainSpSeatYn === 'Y' ? true : undefined,
      }
    })
}

/** 두 지점 사이 거리(km). 시내/시외 검색을 가르는 데 쓴다. */
function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const INTERCITY_KM = 40

async function call(from: GeoPoint, to: GeoPoint, searchType: 0 | 1): Promise<RouteResult> {
  const url =
    `${PATH_URL}?apiKey=${encodeURIComponent(serverEnv.odsayKey!)}` +
    `&SX=${from.lng}&SY=${from.lat}&EX=${to.lng}&EY=${to.lat}` +
    `&OPT=0&SearchType=${searchType}&output=json`

  const res = await fetchJson<OdsayResponse>(
    url,
    { headers: { Referer: serverEnv.odsayReferer } },
    { label: 'ODsay 길찾기' },
  )
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.message,
    }
  }

  const json = res.data
  if (json.error) {
    return {
      ok: false,
      code: 'upstream-error',
      message: json.error.message ?? json.error.msg ?? `ODsay 오류 ${json.error.code ?? ''}`.trim(),
    }
  }

  const paths = json.result?.path ?? []
  const routes: WireRoute[] = paths
    .slice(0, 3) // 대안까지 최대 3개
    .map((p) => ({ legs: toLegs(p.subPath ?? [], from, to), totalMin: p.info?.totalTime ?? 0 }))
    .filter((r) => r.legs.length > 0)

  if (routes.length === 0) {
    return { ok: false, code: 'no-data', message: '이 구간의 대중교통 경로를 찾지 못했습니다' }
  }
  return { ok: true, routes }
}

/** 출발지와 첫 구간 시작점이 이만큼 떨어져 있으면 접근 구간을 따로 구한다. */
const ACCESS_THRESHOLD_KM = 0.4

/**
 * 시외 경로는 **탑승역에서 시작한다.** 사용자가 있는 곳에서 그 역까지 어떻게
 * 가는지는 응답에 없다. 그대로 두면 "수서에서 출발" 이라고만 나오고,
 * 정작 이 앱이 답해야 할 "집에서 언제 나가야 하나" 가 통째로 빠진다.
 *
 * 그래서 첫 구간 시작점이 출발지와 떨어져 있으면 시내 검색을 한 번 더 해서
 * 접근 구간을 앞에 붙인다.
 */
async function withAccessLegs(route: WireRoute, from: GeoPoint): Promise<WireRoute> {
  const head = route.legs[0]
  if (!head?.from.lat || !head.from.lng) return route

  const station: GeoPoint = { name: head.from.name, lat: head.from.lat, lng: head.from.lng }
  if (distanceKm(from, station) < ACCESS_THRESHOLD_KM) return route

  const access = await call(from, station, 0)
  if (!access.ok || access.routes.length === 0) {
    // 접근 경로를 못 구했으면 없는 구간을 지어내지 않는다.
    // 다만 여정이 역에서 시작한다는 사실이 드러나도록 이름은 그대로 둔다.
    return route
  }

  const accessLegs = access.routes[0].legs
  return {
    legs: [...accessLegs, ...route.legs],
    totalMin: access.routes[0].totalMin + route.totalMin,
  }
}

/**
 * ODsay 대중교통 길찾기.
 *
 * 시내(SearchType=0)와 시외(1)는 응답이 다르다. 거리로 먼저 고르고,
 * 결과가 없으면 반대쪽도 시도한다. 시외였다면 탑승역까지 가는 구간을 덧붙인다.
 */
export async function searchTransitRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  if (!serverEnv.odsayKey) {
    return { ok: false, code: 'no-credentials', message: 'ODSAY_API_KEY 가 없습니다' }
  }

  const first: 0 | 1 = distanceKm(from, to) >= INTERCITY_KM ? 1 : 0
  let result = await call(from, to, first)

  // 거리 판단이 빗나갈 수 있다(섬, 광역 경계 등). 반대쪽도 한 번 본다.
  if (!result.ok && result.code === 'no-data') {
    const fallback = await call(from, to, first === 1 ? 0 : 1)
    if (fallback.ok) result = fallback
  }
  if (!result.ok) return result

  if (first === 1) {
    const withAccess = await Promise.all(result.routes.map((r) => withAccessLegs(r, from)))
    return { ok: true, routes: withAccess }
  }
  return result
}
