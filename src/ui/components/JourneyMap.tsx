import { platform } from '../../native/platform'
import { locate, type Coords, type GeoFailure } from '../../geo'
import { useEffect, useRef, useState } from 'react'
import type { CountryCode } from '../../adapters/types'
import type { Leg } from '../../engine/types'
import { pickMap } from '../../map/registry'
import type { MapFailure, MapHandle } from '../../map/types'
import type { I18nShape } from '../../i18n'

function failureText(f: MapFailure): string {
  switch (f.code) {
    case 'not-configured':
      return `지도 키가 없습니다 — .env 에 ${f.envVar} 를 넣으면 지도가 표시됩니다`
    case 'sdk-unavailable':
      return `${f.provider} SDK를 불러오지 못했습니다 (도메인 등록을 확인하세요)`
    case 'no-coords':
      return '이 경로에는 좌표가 없습니다 — 목업 데이터에는 위경도가 없어 지도를 그릴 수 없습니다'
    case 'failed':
      return f.detail ?? '지도를 그리지 못했습니다'
  }
}

/**
 * 여정 위 지점들을 지도에 찍는다.
 * 키가 없거나 좌표가 없으면 지도를 비워두지 않고 이유를 그대로 보여준다.
 */
export function JourneyMap({
  legs,
  country,
  t,
  highlight,
}: {
  legs: Leg[]
  country: CountryCode
  t: I18nShape
  /** 여정에서 짚은 지점. 지도가 같은 곳을 강조한다. */
  highlight?: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MapHandle | null>(null)
  const [failure, setFailure] = useState<MapFailure | null>(null)
  const provider = pickMap(country)
  const native = platform() === 'android'
  const [location, setLocation] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeoFailure | null>(null)
  const requestId = useRef(0)
  async function refreshLocation() {
    const id = ++requestId.current
    setLocating(true)
    const r = await locate(15000)
    if (id !== requestId.current) return
    setLocating(false)
    setGeoError(r.ok ? null : r.failure)
    setLocation(r.ok ? r.data : null)
  }
  useEffect(() => {
    if (native) void refreshLocation()
    return () => { requestId.current++ }
  }, [native])

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el || !provider || (!legs.length && !location)) return
    setFailure(null)
    el.replaceChildren()
    const controller = new AbortController()

    provider.render(el, legs, native ? location ?? undefined : undefined, controller.signal).then((r) => {
      if (cancelled) { if (r.ok) r.handle.destroy?.(); return }
      setFailure(r.ok ? null : r.failure)
      handleRef.current = r.ok ? r.handle : null
    })
    return () => {
      cancelled = true
      controller.abort()
      handleRef.current?.destroy?.()
      handleRef.current = null
    }
  }, [legs, provider, location, native])

  // 여정에서 짚은 지점을 지도에 반영한다
  useEffect(() => {
    handleRef.current?.highlight(highlight ?? null)
  }, [highlight])

  if (!provider) {
    return (
      <div className="map map--empty">
        <p>이 지역을 지원하는 지도 제공자가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="map">
      <div className="map__head">
        <span className="map__label">{t.sections.map}</span>
        <span className="map__provider">{provider.label}</span>
        {native && <button type="button" className="map__locate" onClick={refreshLocation} disabled={locating}>
          ◎ {locating ? t.geo.locating : t.geo.use}
        </button>}
      </div>
      {native && <p className="map__location-status" role="status">
        {geoError ? (geoError.code === 'denied' ? t.geo.nativeDenied : t.geo.err[geoError.code])
          : location ? `● ${t.geo.currentLocation}${location.accuracyM === null ? '' : ` · ${t.geo.accuracy(Math.round(location.accuracyM))}`}`
          : t.geo.locating}
      </p>}
      {failure && <div className="map__gap" role="status">{failureText(failure)}</div>}
      <div className="map__canvas" ref={ref} hidden={!!failure || (!legs.length && !location)} />
    </div>
  )
}
