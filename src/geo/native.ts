import { Geolocation } from '@capacitor/geolocation'
import type { Coords, GeoResult } from './types'

export async function nativePermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const p = await Geolocation.checkPermissions()
    if (p.location === 'granted' || p.coarseLocation === 'granted') return 'granted'
    return p.location === 'denied' ? 'denied' : 'prompt'
  } catch { return 'unknown' }
}

let pending: Promise<GeoResult<Coords>> | null = null
/** 검색 입력과 지도가 동시에 요청해도 권한 창과 GPS 요청은 한 번만 연다. */
export function locateNative(timeout = 15000): Promise<GeoResult<Coords>> {
  if (pending) return pending
  pending = (async (): Promise<GeoResult<Coords>> => {
    try {
      let p = await Geolocation.checkPermissions()
      if (p.location !== 'granted' && p.coarseLocation !== 'granted') {
        p = await Geolocation.requestPermissions({ permissions: ['location'] })
      }
      if (p.location !== 'granted' && p.coarseLocation !== 'granted') {
        return { ok: false, failure: { code: 'denied' } }
      }
      const { coords } = await Geolocation.getCurrentPosition({
        enableHighAccuracy: p.location === 'granted', timeout, maximumAge: 0,
      })
      return { ok: true, data: { lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy } }
    } catch (error) {
      const code = (error as { code?: string })?.code
      return { ok: false, failure: { code: code === 'OS-PLUG-GLOC-0003' ? 'denied'
        : code === 'OS-PLUG-GLOC-0010' ? 'timeout' : 'unavailable' } }
    }
  })().finally(() => { pending = null })
  return pending
}
