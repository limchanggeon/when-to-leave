import { config } from '../config'
import { loadScript } from '../auth/types'
import type { Place } from '../engine/types'
import { withCoords, type MapFailure, type MapHandle, type MapProvider } from './types'

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
    Marker: new (o: { position: object; map: object; zIndex?: number }) => {
      setZIndex(z: number): void
    }
    Circle: new (o: {
      center: object
      radius: number
      strokeWeight: number
      strokeColor: string
      strokeOpacity: number
      fillColor: string
      fillOpacity: number
    }) => { setMap(m: object | null): void; setPosition(p: object): void }
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

    return new Promise<
      { ok: true; handle: MapHandle } | { ok: false; failure: MapFailure }
    >((resolve) => {
      kakao.maps.load(() => {
        try {
          const coords = points.map((p) => new kakao.maps.LatLng(p.lat, p.lng))
          const map = new kakao.maps.Map(el, { center: coords[0], level: 7 })

          coords.forEach((position) => new kakao.maps.Marker({ position, map }))
          if (coords.length > 1) {
            new kakao.maps.Polyline({
              path: coords,
              strokeWeight: 4,
              strokeColor: '#2F6BFF',
              strokeOpacity: 0.9,
              map,
            })
            const bounds = new kakao.maps.LatLngBounds()
            coords.forEach((c) => bounds.extend(c))
            map.setBounds(bounds)
          }

          // 강조용 원을 하나만 만들어 위치만 옮긴다 — 매번 새로 만들면 쌓인다
          const ring = new kakao.maps.Circle({
            center: coords[0],
            radius: 900,
            strokeWeight: 3,
            strokeColor: '#2F6BFF',
            strokeOpacity: 0.9,
            fillColor: '#2F6BFF',
            fillOpacity: 0.18,
          })

          const handle: MapHandle = {
            highlight(index) {
              if (index === null || !coords[index]) {
                ring.setMap(null)
                return
              }
              ring.setPosition(coords[index])
              ring.setMap(map)
            },
          }
          resolve({ ok: true, handle })
        } catch (e) {
          resolve({ ok: false, failure: { code: 'failed', provider: 'kakao-map', detail: String(e) } })
        }
      })
    })
  },
}
