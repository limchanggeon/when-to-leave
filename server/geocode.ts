import { serverEnv } from './env'
import { fetchJson } from './http'

const SEARCH = 'https://dapi.kakao.com/v2/local/search/keyword.json'

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
