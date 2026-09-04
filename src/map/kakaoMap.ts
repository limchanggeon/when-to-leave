import { config } from '../config'
import { loadScript } from '../auth/types'
import type { Leg } from '../engine/types'
import { placesOf, withCoords, type MapFailure, type MapHandle, type MapProvider } from './types'

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
      strokeStyle?: string
      map: object
    }) => object
  }
}

export const kakaoMap: MapProvider = {
  id: 'kakao-map',
  label: '카카오맵',
  configured: Boolean(config.kakao.jsKey),
  supports: (country) => country === 'KR',

  async render(el: HTMLElement, legs: Leg[]) {
    const key = config.kakao.jsKey
    if (!key) {
      return { ok: false as const, failure: { code: 'not-configured', provider: 'kakao-map', envVar: 'VITE_KAKAO_JS_KEY' } as MapFailure }
    }

    const points = withCoords(placesOf(legs))
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

          const bounds = new kakao.maps.LatLngBounds()
          coords.forEach((c) => bounds.extend(c))

          /*
           * 구간마다 따로 그린다.
           *
           * 실제 지나는 길(shape)이 있으면 그 길을 실선으로 그린다.
           * 없는 구간 — 주로 도보 — 은 양 끝을 점선으로만 잇는다.
           * 예전에는 정류장 좌표를 전부 실선으로 이어버려서,
           * 산을 가로지르는 길이 있는 것처럼 보였다.
           */
          for (const leg of legs) {
            const shape = leg.shape
            if (shape && shape.length > 1) {
              const path = shape.map((s) => new kakao.maps.LatLng(s.lat, s.lng))
              path.forEach((c) => bounds.extend(c))
              new kakao.maps.Polyline({
                path,
                strokeWeight: 5,
                strokeColor: '#2F6BFF',
                strokeOpacity: 0.9,
                map,
              })
              continue
            }

            const a = leg.from
            const b = leg.to
            if (typeof a.lat !== 'number' || typeof a.lng !== 'number') continue
            if (typeof b.lat !== 'number' || typeof b.lng !== 'number') continue
            new kakao.maps.Polyline({
              path: [new kakao.maps.LatLng(a.lat, a.lng), new kakao.maps.LatLng(b.lat, b.lng)],
              strokeWeight: 3,
              strokeColor: '#94A3B8',
              strokeOpacity: 0.85,
              strokeStyle: 'shortdash', // 실제 경로가 아니라 이었을 뿐임을 알린다
              map,
            })
          }

          if (coords.length > 1) map.setBounds(bounds)

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
