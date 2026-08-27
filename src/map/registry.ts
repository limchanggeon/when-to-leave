import type { CountryCode } from '../adapters/types'
import { kakaoMap } from './kakaoMap'
import { googleMap } from './googleMap'
import type { MapProvider } from './types'

const providers: MapProvider[] = [kakaoMap, googleMap]

/**
 * 나라에 맞는 지도를 고른다.
 * 구글맵은 한국에서 길찾기를 제공하지 않으므로 국내는 카카오만 후보다.
 */
export function pickMap(country: CountryCode): MapProvider | null {
  return providers.find((p) => p.supports(country)) ?? null
}

export const allMapProviders = (): ReadonlyArray<MapProvider> => providers
