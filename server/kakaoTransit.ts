import { serverEnv } from './env'
import { fetchJson } from './http'
import type { GeoPoint } from './geocode'
import type { LatLng, RouteResult, WireLeg, WireRoute } from './routeTypes'
import { encodePolyline } from './polyline'

/**
 * 카카오 대중교통 길찾기.
 *
 * 2026-07-21 에 열린 API 다. ODsay 와 견줘 이 앱에 중요한 차이가 둘 있다:
 *
 * 1. **모든 구간의 실제 좌표를 준다 — 도보까지.** ODsay 는 도보 선형을 주지 않아
 *    산을 가로지르는 직선이 그려졌다. 선형이 같은 응답에 들어 있어 추가 호출도 없다.
 * 2. **시외를 못 한다.** BUS / SUBWAY / BUS_AND_SUBWAY 뿐이라 대전역→부산역은
 *    NO_RESULTS 다. 시외는 TAGO 시각표로 따로 엮는다.
 */
const TRANSIT_URL = 'https://dapi.kakao.com/v2/routing/publictraffic'
const WALK_URL = 'https://dapi.kakao.com/v2/routing/walk'

interface KakaoPath {
  points?: [number, number][]
}

interface KakaoStep {
  properties?: {
    guidance?: string
    type?: 'BUS' | 'SUBWAY' | 'WALKING'
    distance?: number
    time?: number
    stops?: { name?: string }[]
    vehicles?: { name?: string; type?: string }[]
  }
  path?: KakaoPath
}

interface KakaoRoute {
  properties?: {
    type?: string
    totalDistance?: number
    totalTime?: number
    transfers?: number
    fare?: { value?: number }
  }
  steps?: KakaoStep[]
}

interface TransitResponse {
  status?: string
  properties?: { total?: number; landingURL?: string }
  routes?: KakaoRoute[]
}

interface WalkResponse {
  status?: string
  route?: {
    legs?: {
      properties?: { distance?: number; time?: number }
      steps?: { path?: KakaoPath }[]
    }[]
  }
}

const KIND: Record<string, WireLeg['kind']> = {
  BUS: 'bus',
  SUBWAY: 'subway',
  WALKING: 'walk',
}

/** 카카오는 [x, y] = [경도, 위도] 로 준다. 뒤집어 쓰면 지도가 바다로 간다. */
const toLatLng = (points: [number, number][] | undefined): LatLng[] =>
  (points ?? []).map(([x, y]) => ({ lat: y, lng: x }))

const auth = () => ({ Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` })

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; routes: WireRoute[] }>()
const cacheKey = (a: GeoPoint, b: GeoPoint) =>
  `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`

/** 두 지점 사이 거리(m). 접근 도보를 구할 값어치가 있는지 가른다. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 이 아래로 떨어져 있으면 도보 구간을 따로 만들지 않는다. */
const ACCESS_MIN_M = 120

/**
 * 실제 도보 경로. 카카오 대중교통 응답에는 출발지→첫 정류장,
 * 마지막 정류장→목적지 구간이 빠져 있어 여기서 채운다.
 */
async function walkLeg(from: GeoPoint, to: GeoPoint): Promise<WireLeg | null> {
  if (metres(from, to) < ACCESS_MIN_M) return null

  const url =
    `${WALK_URL}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}`
  const res = await fetchJson<WalkResponse>(url, { headers: auth() }, { label: '카카오 도보' })
  if (!res.ok || res.data.status !== 'OK') return null

  const leg = res.data.route?.legs?.[0]
  const minutes = Math.max(1, Math.round((leg?.properties?.time ?? 0) / 60))
  const shape = (leg?.steps ?? []).flatMap((s) => toLatLng(s.path?.points))

  return {
    kind: 'walk',
    from: { name: from.name, lat: from.lat, lng: from.lng },
    to: { name: to.name, lat: to.lat, lng: to.lng },
    durationMin: minutes,
    confidence: 'estimated',
    shape: shape.length > 1 ? encodePolyline(shape) : undefined,
  }
}

function toLegs(route: KakaoRoute): WireLeg[] {
  const steps = route.steps ?? []
  const fare = route.properties?.fare?.value
  let farePlaced = false

  return steps.map((step) => {
    const p = step.properties ?? {}
    const kind = KIND[p.type ?? ''] ?? 'bus'
    const points = step.path?.points ?? []
    const shape = toLatLng(points)
    const stops = p.stops ?? []

    const head = points[0]
    const tail = points[points.length - 1]
    const name = (i: 0 | -1, fallback: string) =>
      (i === 0 ? stops[0]?.name : stops[stops.length - 1]?.name)?.trim() || fallback

    const carrier =
      kind === 'walk'
        ? undefined
        : (p.vehicles ?? []).map((v) => v.name).filter(Boolean).join(', ') || undefined

    // 요금은 경로 단위로 온다. 첫 탈것 구간에 한 번만 붙인다.
    const legFare = kind !== 'walk' && !farePlaced && fare ? ((farePlaced = true), fare) : undefined

    return {
      kind,
      from: { name: name(0, '출발'), lat: head?.[1], lng: head?.[0] },
      to: { name: name(-1, '도착'), lat: tail?.[1], lng: tail?.[0] },
      durationMin: Math.max(1, Math.round((p.time ?? 0) / 60)),
      carrier,
      // 카카오도 시각표가 아니라 평시 소요시간을 준다
      confidence: 'estimated',
      fare: legFare,
      shape: shape.length > 1 ? encodePolyline(shape) : undefined,
      // 지하철은 TAGO 시각표를 붙일 수 있다. 시내버스는 해당 서비스가 없다.
      tagoKind: kind === 'subway' ? 'subway' : undefined,
    }
  })
}

/**
 * 시내 대중교통 경로. 시외 구간은 NO_RESULTS 로 돌아오므로
 * 호출한 쪽이 그때 시외 조합으로 넘어가면 된다.
 */
export async function searchTransitKakao(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  if (!serverEnv.kakaoRestKey) {
    return { ok: false, code: 'no-credentials', message: 'KAKAO_REST_API_KEY 가 없습니다' }
  }

  const key = cacheKey(from, to)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, routes: hit.routes }

  const url =
    `${TRANSIT_URL}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}` +
    `&s_name=${encodeURIComponent(from.name)}&e_name=${encodeURIComponent(to.name)}`
  const res = await fetchJson<TransitResponse>(url, { headers: auth() }, { label: '카카오 대중교통' })
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.message,
    }
  }

  const status = res.data.status
  if (status !== 'OK') {
    // 시외이거나(NO_RESULTS) 근처에 정류장이 없다(STARTNODES_NULL).
    // 어느 쪽이든 "이 방법으로는 못 찾았다" 는 사실만 전한다.
    return { ok: false, code: 'no-data', message: `카카오 대중교통 결과 없음 (${status})` }
  }

  const routes: WireRoute[] = []
  for (const r of (res.data.routes ?? []).slice(0, 3)) {
    const legs = toLegs(r)
    if (legs.length === 0) continue

    const first = legs[0]
    const last = legs[legs.length - 1]
    const access =
      typeof first.from.lat === 'number' && typeof first.from.lng === 'number'
        ? await walkLeg(from, { name: first.from.name, lat: first.from.lat, lng: first.from.lng })
        : null
    const egress =
      typeof last.to.lat === 'number' && typeof last.to.lng === 'number'
        ? await walkLeg({ name: last.to.name, lat: last.to.lat, lng: last.to.lng }, to)
        : null

    const all = [...(access ? [access] : []), ...legs, ...(egress ? [egress] : [])]
    routes.push({
      legs: all,
      totalMin: all.reduce((sum, l) => sum + l.durationMin, 0),
    })
  }

  if (routes.length === 0) {
    return { ok: false, code: 'no-data', message: '경로를 찾지 못했습니다' }
  }
  cache.set(key, { at: Date.now(), routes })
  return { ok: true, routes }
}
