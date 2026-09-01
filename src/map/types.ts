import type { CountryCode } from '../adapters/types'
import type { Place } from '../engine/types'

/**
 * 지도. 설계 문서의 지역 분기 원칙을 그대로 따른다 —
 * 구글맵은 한국에서 길찾기가 막혀 있으므로 국내는 카카오, 해외는 구글.
 */
export type MapFailure =
  | { code: 'not-configured'; provider: string; envVar: string }
  | { code: 'sdk-unavailable'; provider: string }
  | { code: 'no-coords'; provider: string }
  | { code: 'failed'; provider: string; detail?: string }

export interface MapProvider {
  id: string
  label: string
  configured: boolean
  supports(country: CountryCode): boolean
  /**
   * 컨테이너에 지도를 그리고 경로 위 지점들을 찍는다.
   * 성공하면 지도를 조작할 수 있는 손잡이를 돌려준다 —
   * 여정에서 구간을 짚었을 때 지도가 반응해야 하기 때문이다.
   */
  render(
    el: HTMLElement,
    places: Place[],
  ): Promise<{ ok: true; handle: MapHandle } | { ok: false; failure: MapFailure }>
}

export interface MapHandle {
  /** index 번째 지점을 강조한다. null 이면 강조를 푼다. */
  highlight(index: number | null): void
}

/** 좌표가 있는 지점만 추린다. 도보 구간의 "집" 같은 곳은 좌표가 없다. */
export const withCoords = (places: Place[]) =>
  places.filter((p): p is Place & { lat: number; lng: number } =>
    typeof p.lat === 'number' && typeof p.lng === 'number')
