import { serverEnv } from './env'

const SEARCH = 'https://dapi.kakao.com/v2/local/search/keyword.json'

export interface GeoPoint {
  name: string
  lat: number
  lng: number
}

export type GeocodeResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'upstream-error'; message: string }

/**
 * 장소명 → 좌표. 카카오 로컬 키워드 검색을 쓴다.
 * REST API 키는 서버에만 있어야 하므로 브라우저에서 부르지 않는다.
 */
export async function geocode(query: string): Promise<GeocodeResult> {
  if (!serverEnv.kakaoRestKey) {
    return { ok: false, code: 'no-credentials', message: 'KAKAO_REST_API_KEY 가 없습니다' }
  }

  const url = `${SEARCH}?query=${encodeURIComponent(query)}&size=1`
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` },
  })
  if (!res.ok) {
    return { ok: false, code: 'upstream-error', message: `카카오 로컬 검색 실패 (${res.status})` }
  }

  const json = (await res.json()) as {
    documents?: { place_name: string; x: string; y: string }[]
  }
  const first = json.documents?.[0]
  if (!first) {
    return { ok: false, code: 'no-data', message: `"${query}" 를 찾지 못했습니다` }
  }

  return {
    ok: true,
    point: { name: first.place_name, lat: Number(first.y), lng: Number(first.x) },
  }
}
