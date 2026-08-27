import { config } from '../config'
import { loadScript } from '../auth/types'
import type { Place } from '../engine/types'
import { withCoords, type MapFailure, type MapProvider } from './types'

const SDK = (key: string) =>
  `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly`

type GMaps = {
  maps: {
    LatLngBounds: new () => { extend(p: { lat: number; lng: number }): void }
    Map: new (el: HTMLElement, o: object) => { fitBounds(b: object): void }
    Marker: new (o: object) => object
    Polyline: new (o: object) => object
  }
}

/** 해외 구간 전용. 한국은 구글 길찾기가 막혀 있어 supports 에서 제외한다. */
export const googleMap: MapProvider = {
  id: 'google-map',
  label: '구글 지도',
  configured: Boolean(config.google.mapsKey),
  supports: (country) => country !== 'KR',

  async render(el: HTMLElement, places: Place[]) {
    const key = config.google.mapsKey
    if (!key) {
      return { ok: false as const, failure: { code: 'not-configured', provider: 'google-map', envVar: 'VITE_GOOGLE_MAPS_KEY' } as MapFailure }
    }

    const points = withCoords(places)
    if (points.length === 0) {
      return { ok: false as const, failure: { code: 'no-coords', provider: 'google-map' } as MapFailure }
    }

    try {
      await loadScript(SDK(key))
    } catch {
      return { ok: false as const, failure: { code: 'sdk-unavailable', provider: 'google-map' } as MapFailure }
    }

    const g = (window as unknown as { google?: GMaps }).google
    if (!g?.maps) {
      return { ok: false as const, failure: { code: 'sdk-unavailable', provider: 'google-map' } as MapFailure }
    }

    try {
      const path = points.map((p) => ({ lat: p.lat, lng: p.lng }))
      const map = new g.maps.Map(el, { center: path[0], zoom: 8, mapTypeControl: false })
      path.forEach((position) => new g.maps.Marker({ position, map }))
      if (path.length > 1) {
        new g.maps.Polyline({ path, strokeColor: '#4C6BE8', strokeWeight: 3, strokeOpacity: 0.9, map })
        const bounds = new g.maps.LatLngBounds()
        path.forEach((c) => bounds.extend(c))
        map.fitBounds(bounds)
      }
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, failure: { code: 'failed', provider: 'google-map', detail: String(e) } as MapFailure }
    }
  },
}
