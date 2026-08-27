import type { Coords, GeoResult } from './types'

/**
 * 좌표 → 지명. 서버의 /api/reverse-geocode 를 거친다.
 *
 * 예전에는 브라우저에서 카카오 지도 SDK 를 불러 Geocoder 를 썼는데,
 * 주소 한 줄 얻자고 지도 라이브러리를 통째로 로드하는 셈이었고
 * 그 로드가 멈추면 화면이 "위치 확인 중…" 에 갇혔다.
 * 서버 REST 호출로 옮기면서 그 위험이 사라졌다.
 */
export async function reverseGeocode(coords: Coords): Promise<GeoResult<string>> {
  try {
    const res = await fetch('/api/reverse-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: coords.lat, lng: coords.lng }),
    })
    const json = (await res.json()) as { name: string } | { error: { message: string } }
    if (!res.ok || 'error' in json) {
      const detail = 'error' in json ? json.error.message : undefined
      return { ok: false, failure: { code: 'no-address', detail } }
    }
    return { ok: true, data: json.name }
  } catch {
    return { ok: false, failure: { code: 'no-address', detail: '서버에 연결하지 못했습니다' } }
  }
}
