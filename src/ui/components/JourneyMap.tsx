import { useEffect, useRef, useState } from 'react'
import type { CountryCode } from '../../adapters/types'
import type { LatLng, Leg } from '../../engine/types'
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
 * 구간이 실제로 지나는 길을 받아 온다.
 *
 * 서버가 경로마다 미리 받아두면 ODsay 호출이 검색 한 번에 서너 번으로
 * 늘어난다. 지도를 실제로 보는 건 고른 경로 하나뿐이라 여기서 받는다.
 * 실패해도 조용히 넘어간다 — 선형이 없으면 지도가 점선으로 그린다.
 */
async function fetchShapes(legs: Leg[]): Promise<(LatLng[] | undefined)[]> {
  const objs = [...new Set(legs.map((l) => l.shapeRef?.mapObj).filter(Boolean))] as string[]
  if (objs.length === 0) return []

  const lanes = new Map<string, LatLng[][]>()
  await Promise.all(
    objs.map(async (mapObj) => {
      try {
        const r = await fetch(`/api/lane?mapObj=${encodeURIComponent(mapObj)}`)
        if (!r.ok) return
        const json = (await r.json()) as { lanes?: LatLng[][] }
        if (json.lanes) lanes.set(mapObj, json.lanes)
      } catch {
        // 무시 — 점선으로 그려진다
      }
    }),
  )

  return legs.map((l) => {
    const ref = l.shapeRef
    if (!ref) return undefined
    const shape = lanes.get(ref.mapObj)?.[ref.index]
    return shape && shape.length > 1 ? shape : undefined
  })
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

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el || !provider) return

    // 선형을 먼저 받고 그린다. 못 받아도 그리기는 한다(점선).
    fetchShapes(legs)
      .then((shapes) => {
        if (cancelled) return null
        const drawn = shapes.length
          ? legs.map((l, i) => (shapes[i] ? { ...l, shape: shapes[i] } : l))
          : legs
        return provider.render(el, drawn)
      })
      .then((r) => {
        if (cancelled || !r) return
        setFailure(r.ok ? null : r.failure)
        handleRef.current = r.ok ? r.handle : null
      })
    return () => {
      cancelled = true
    }
  }, [legs, provider])

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
