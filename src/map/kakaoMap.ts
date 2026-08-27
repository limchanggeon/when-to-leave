import { config } from '../config'
import { loadScript } from '../auth/types'
import type { Place } from '../engine/types'
import { withCoords, type MapFailure, type MapProvider } from './types'

const SDK = (key: string) =>
  `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`

type KakaoMaps = {
  maps: {
    load(cb: () => void): void
    LatLng: new (lat: number, lng: number) => object
    LatLngBounds: new () => { extend(p: object): void }
    Map: new (el: HTMLElement, o: { center: object; level: number }) => {
      setBounds(b: object): void
    }
    Marker: new (o: { position: object; map: object }) => object
    Polyline: new (o: {
      path: object[]
      strokeWeight: number
      strokeColor: string
      strokeOpacity: number
      map: object
    }) => object
  }
}

export const kakaoMap: MapProvider = {
  id: 'kakao-map',
  label: '카카오맵',
  configured: Boolean(config.kakao.jsKey),
  supports: (country) => country === 'KR',

  async render(el: HTMLElement, places: Place[]) {
    const key = config.kakao.jsKey
    if (!key) {
      return { ok: false as const, failure: { code: 'not-configured', provider: 'kakao-map', envVar: 'VITE_KAKAO_JS_KEY' } as MapFailure }
    }

    const points = withCoords(places)
    if (points.length === 0) {
      return { ok: false as const, failure: { code: 'no-coords', provider: 'kakao-map' } as MapFailure }
    }

    try {
      await loadScript(SDK(key))
    } catch {
      return { ok: false as const, failure: { code: 'sdk-unavailable', provider: 'kakao-map' } as MapFailure }
    }

    const kakao = (window as unknown as { kakao?: KakaoMaps }).kakao
    if (!kakao?.maps) {
      return { ok: false as const, failure: { code: 'sdk-unavailable', provider: 'kakao-map' } as MapFailure }
    }

    return new Promise<{ ok: true } | { ok: false; failure: MapFailure }>((resolve) => {
      kakao.maps.load(() => {
        try {
          const coords = points.map((p) => new kakao.maps.LatLng(p.lat, p.lng))
          const map = new kakao.maps.Map(el, { center: coords[0], level: 7 })

          coords.forEach((position) => new kakao.maps.Marker({ position, map }))
          if (coords.length > 1) {
            new kakao.maps.Polyline({
              path: coords,
              strokeWeight: 3,
              strokeColor: '#4C6BE8',
              strokeOpacity: 0.9,
              map,
            })
            const bounds = new kakao.maps.LatLngBounds()
            coords.forEach((c) => bounds.extend(c))
            map.setBounds(bounds)
          }
          resolve({ ok: true })
        } catch (e) {
          resolve({ ok: false, failure: { code: 'failed', provider: 'kakao-map', detail: String(e) } })
        }
      })
    })
  },
}
