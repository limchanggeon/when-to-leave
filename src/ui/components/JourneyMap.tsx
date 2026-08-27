import { useEffect, useRef, useState } from 'react'
import type { CountryCode } from '../../adapters/types'
import type { Leg, Place } from '../../engine/types'
import { pickMap } from '../../map/registry'
import type { MapFailure } from '../../map/types'

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
export function JourneyMap({ legs, country }: { legs: Leg[]; country: CountryCode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<MapFailure | null>(null)
  const provider = pickMap(country)

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el || !provider) return

    const places: Place[] = [...legs.map((l) => l.from), legs[legs.length - 1].to]
    provider.render(el, places).then((r) => {
      if (cancelled) return
      setFailure(r.ok ? null : r.failure)
    })
    return () => {
      cancelled = true
    }
  }, [legs, provider])

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
        <span className="map__label">지도</span>
        <span className="map__provider">{provider.label}</span>
      </div>
      {failure ? (
        <div className="map__gap" role="status">
          <span aria-hidden="true">🗺</span>
          <span>{failureText(failure)}</span>
        </div>
      ) : (
        <div className="map__canvas" ref={ref} />
      )}
    </div>
  )
}
