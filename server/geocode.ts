import { serverEnv } from './env'
import { fetchJson } from './http'

const SEARCH = 'https://dapi.kakao.com/v2/local/search/keyword.json'
const COORD2ADDRESS = 'https://dapi.kakao.com/v2/local/geo/coord2address.json'

export interface GeoPoint {
  name: string
  lat: number
  lng: number
}

export type GeocodeResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'network' | 'upstream-error'; message: string }

/**
 * 장소명 → 좌표. 카카오 로컬 키워드 검색을 쓴다.
 * REST API 키는 서버에만 있어야 하므로 브라우저에서 부르지 않는다.
 */
export async function geocode(query: string): Promise<GeocodeResult> {
  if (!serverEnv.kakaoRestKey) {
    return { ok: false, code: 'no-credentials', message: 'KAKAO_REST_API_KEY 가 없습니다' }
  }

  const res = await fetchJson<{ documents?: { place_name: string; x: string; y: string }[] }>(
    `${SEARCH}?query=${encodeURIComponent(query)}&size=1`,
    { headers: { Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` } },
    { label: '카카오 장소 검색' },
  )
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.message,
    }
  }

  const first = res.data.documents?.[0]
  if (!first) {
    return { ok: false, code: 'no-data', message: `"${query}" 를 찾지 못했습니다` }
  }

  return {
    ok: true,
    point: { name: first.place_name, lat: Number(first.y), lng: Number(first.x) },
  }
}

export type ReverseResult =
  | { ok: true; name: string }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'network' | 'upstream-error'; message: string }

/**
 * 좌표 → 지명. 카카오 REST coord2address 를 쓴다.
 *
 * 브라우저에서 지도 SDK 를 통째로 불러 쓰지 않고 여기서 처리한다 —
 * 주소 한 줄 얻자고 지도 라이브러리를 로드하면 느리고, 로드가 멈추면
 * 화면이 "위치 확인 중…" 에 갇힌다.
 *
 * 이름은 알아보기 쉬운 순서로 고른다: 건물명 → 도로명 → 지번.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  if (!serverEnv.kakaoRestKey) {
    return { ok: false, code: 'no-credentials', message: 'KAKAO_REST_API_KEY 가 없습니다' }
  }

  const res = await fetchJson<{
    documents?: {
      road_address?: { address_name?: string; building_name?: string } | null
      address?: { address_name?: string } | null
    }[]
  }>(
    `${COORD2ADDRESS}?x=${lng}&y=${lat}`,
    { headers: { Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` } },
    { label: '카카오 주소 변환' },
  )
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.message,
    }
  }

  const doc = res.data.documents?.[0]
  const name =
    doc?.road_address?.building_name ||
    doc?.road_address?.address_name ||
    doc?.address?.address_name

  return name
    ? { ok: true, name }
    : { ok: false, code: 'no-data', message: '이 좌표의 주소를 찾지 못했습니다' }
}
