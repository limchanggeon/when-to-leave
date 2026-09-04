import { serverEnv } from './env'
import { fetchJson } from './http'
import type { GeoPoint } from './geocode'
import type { WireLeg, WireRoute } from './routeTypes'

/**
 * 구글 오류를 손쓸 수 있는 문장으로 바꾼다.
 *
 * "REQUEST_DENIED" 만 보여주면 키가 틀린 줄 알고 키를 다시 만들게 된다.
 * 실제로는 대개 콘솔에서 그 API 를 켜지 않았거나, 브라우저용 키를
 * 서버에서 써서 리퍼러 제한에 걸린 것이다.
 */
function explain(api: string, status: string | undefined, raw: string | undefined): string {
  const detail = raw ?? ''
  if (/not activated|has not been used|is disabled/i.test(detail)) {
    return `${api} 가 이 구글 프로젝트에서 켜져 있지 않습니다. Cloud Console 에서 ${api} 를 사용 설정하세요`
  }
  if (/referer|referrer|not authorized/i.test(detail)) {
    return `이 키는 브라우저 전용(리퍼러 제한)이라 서버에서 쓸 수 없습니다. GOOGLE_MAPS_SERVER_KEY 로 제한 없는(또는 IP 제한) 키를 넣으세요`
  }
  return detail || `구글 ${api} 오류 ${status ?? ''}`.trim()
}

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json'

export type GoogleResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'network' | 'upstream-error'; message: string }

/** 구글 지오코딩 결과 — 나라를 함께 돌려준다. 어느 어댑터로 보낼지 정하는 데 쓴다. */
export interface WorldPoint extends GeoPoint {
  /** ISO 3166-1 alpha-2. 'KR', 'JP' 등. */
  country: string | null
}

interface GeocodeResponse {
  status: string
  error_message?: string
  results?: {
    formatted_address: string
    geometry: { location: { lat: number; lng: number } }
    address_components: { short_name: string; types: string[] }[]
  }[]
}

/**
 * 전 세계 지오코딩. 카카오가 못 찾은 곳을 여기서 받는다.
 * 나라 코드를 함께 주므로, 국내인지 해외인지 추측하지 않아도 된다.
 */
export async function geocodeWorld(query: string): Promise<GoogleResult<WorldPoint>> {
  const key = serverEnv.googleMapsServerKey
  if (!key) {
    return { ok: false, code: 'no-credentials', message: 'GOOGLE_MAPS_SERVER_KEY 가 없습니다' }
  }

  const res = await fetchJson<GeocodeResponse>(
    `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`,
    {},
    { label: '구글 지오코딩' },
  )
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.kind === 'status' ? explain('Geocoding API', undefined, res.message) : res.message,
    }
  }

  const json = res.data
  if (json.status === 'ZERO_RESULTS') {
    return { ok: false, code: 'no-data', message: `"${query}" 를 찾지 못했습니다` }
  }
  if (json.status !== 'OK' || !json.results?.length) {
    return {
      ok: false,
      code: 'upstream-error',
      message: explain('Geocoding API', json.status, json.error_message),
    }
  }

  const first = json.results[0]
  const country =
    first.address_components.find((c) => c.types.includes('country'))?.short_name ?? null

  return {
    ok: true,
    data: {
      name: first.formatted_address,
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
      country,
    },
  }
}

/* ---------------- 경로 ---------------- */

interface DirectionsResponse {
  status: string
  error_message?: string
  routes?: {
    legs: {
      duration: { value: number }
      steps: {
        travel_mode: string
        duration: { value: number }
        start_location: { lat: number; lng: number }
        end_location: { lat: number; lng: number }
        transit_details?: {
          departure_stop?: { name?: string }
          arrival_stop?: { name?: string }
          line?: { short_name?: string; name?: string; vehicle?: { type?: string } }
          headway?: number
        }
      }[]
    }[]
  }[]
}

/**
 * 구글이 일본 대중교통을 다루지 않는다는 사실.
 *
 * 실측으로 확인했다 — 웹서비스 Directions, 신형 Routes, 브라우저 JS SDK
 * 셋 모두 도쿄·오사카에서 ZERO_RESULTS 를 내고 런던·뉴욕은 정상이다.
 * 구글 지도 **앱**에는 일본 대중교통이 있지만 현지 사업자와의 별도 계약이라
 * Maps Platform 으로는 열리지 않는다.
 *
 * 그래서 일본은 "찾지 못했다" 가 아니라 "이 방법으로는 안 된다" 이다.
 * 나중에 ODPT(GTFS)로 직접 경로 엔진을 얹거나, NAVITIME·駅すぱあと 같은
 * 상용 API 를 붙여야 한다.
 */
export const GOOGLE_HAS_NO_TRANSIT = new Set(['JP'])

const kindOfStep = (step: {
  travel_mode: string
  transit_details?: { line?: { vehicle?: { type?: string } } }
}): WireLeg['kind'] => {
  if (step.travel_mode !== 'TRANSIT') return 'walk'
  const type = step.transit_details?.line?.vehicle?.type ?? ''
  if (/SUBWAY|METRO_RAIL|MONORAIL/.test(type)) return 'subway'
  if (/BUS|TROLLEYBUS|INTERCITY_BUS/.test(type)) return 'bus'
  return 'train'
}

const minutes = (seconds: number | undefined): number =>
  seconds ? Math.max(0, Math.round(seconds / 60)) : 0

/**
 * 구글 대중교통 경로. 국내(구글이 길찾기를 안 함)와 일본(자료 없음)을 뺀
 * 나머지 나라에 쓴다.
 */
export async function searchTransitGoogle(
  from: GeoPoint,
  to: GeoPoint,
): Promise<GoogleResult<WireRoute[]>> {
  const key = serverEnv.googleMapsServerKey
  if (!key) {
    return { ok: false, code: 'no-credentials', message: 'GOOGLE_MAPS_SERVER_KEY 가 없습니다' }
  }

  const url =
    `${DIRECTIONS_URL}?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}` +
    `&mode=transit&alternatives=true&key=${encodeURIComponent(key)}`

  const res = await fetchJson<DirectionsResponse>(url, {}, { label: '구글 길찾기' })
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.kind === 'status' ? explain('Directions API', undefined, res.message) : res.message,
    }
  }

  const json = res.data
  if (json.status === 'ZERO_RESULTS') {
    return { ok: false, code: 'no-data', message: '구글에서 이 구간의 대중교통 경로를 찾지 못했습니다' }
  }
  if (json.status !== 'OK' || !json.routes?.length) {
    return {
      ok: false,
      code: 'upstream-error',
      message: explain('Directions API', json.status, json.error_message),
    }
  }

  const routes: WireRoute[] = json.routes.slice(0, 3).map((r) => {
    const leg = r.legs[0]
    const legs: WireLeg[] = leg.steps
      .map((step) => {
        const kind = kindOfStep(step)
        const td = step.transit_details
        const line = td?.line
        return {
          kind,
          from: {
            name: td?.departure_stop?.name ?? from.name,
            lat: step.start_location.lat,
            lng: step.start_location.lng,
          },
          to: {
            name: td?.arrival_stop?.name ?? to.name,
            lat: step.end_location.lat,
            lng: step.end_location.lng,
          },
          durationMin: minutes(step.duration?.value),
          carrier: kind === 'walk' ? undefined : (line?.short_name ?? line?.name),
          confidence: 'estimated' as const,
          frequencyMin: td?.headway ? minutes(td.headway) : undefined,
        }
      })
      .filter((l) => l.durationMin > 0)

    return { legs, totalMin: minutes(leg.duration?.value) }
  })

  const usable = routes.filter((r) => r.legs.length > 0)
  if (usable.length === 0) {
    return { ok: false, code: 'no-data', message: '구글에서 이 구간의 대중교통 경로를 찾지 못했습니다' }
  }
  return { ok: true, data: usable }
}
