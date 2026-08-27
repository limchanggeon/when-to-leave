import { serverEnv } from './env'
import { fetchJson } from './http'
import type { GeoPoint } from './geocode'

const PATH_URL = 'https://api.odsay.com/v1/api/searchPubTransPathT'

/** 클라이언트로 넘길 구간. LegSpec 과 같은 모양이되 JSON 으로 안전한 것만 담는다. */
export interface WireLeg {
  kind: 'walk' | 'subway' | 'bus'
  from: { name: string; lat?: number; lng?: number }
  to: { name: string; lat?: number; lng?: number }
  durationMin: number
  carrier?: string
  confidence: 'live' | 'scheduled' | 'estimated'
}

export type RouteResult =
  | { ok: true; legs: WireLeg[]; totalMin: number }
  | { ok: false; code: 'no-credentials' | 'no-data' | 'network' | 'upstream-error'; message: string }

const TRAFFIC = { 1: 'subway', 2: 'bus', 3: 'walk' } as const

interface OdsaySubPath {
  trafficType: 1 | 2 | 3
  sectionTime: number
  startName?: string
  endName?: string
  startX?: number
  startY?: number
  endX?: number
  endY?: number
  lane?: { name?: string; busNo?: string }[]
}

interface OdsayResponse {
  error?: { code?: string; message?: string; msg?: string }
  result?: {
    path?: { info: { totalTime: number }; subPath: OdsaySubPath[] }[]
  }
}

const laneName = (sub: OdsaySubPath): string | undefined => {
  const lane = sub.lane?.[0]
  return lane?.name ?? lane?.busNo
}

/**
 * ODsay 대중교통 길찾기.
 *
 * 한계: 이 API 는 구간 소요시간만 주고 **출발 시각표는 주지 않는다.**
 * 그래서 모든 구간이 연속 구간(durationMin)으로 온다 — 역산 엔진의
 * 데드라인 전파는 열차 시간표가 붙어야 제 몫을 한다.
 * 지금은 "실제 소요시간"까지가 이 어댑터가 줄 수 있는 전부다.
 */
export async function searchTransitRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  if (!serverEnv.odsayKey) {
    return { ok: false, code: 'no-credentials', message: 'ODSAY_API_KEY 가 없습니다' }
  }

  const url =
    `${PATH_URL}?apiKey=${encodeURIComponent(serverEnv.odsayKey)}` +
    `&SX=${from.lng}&SY=${from.lat}&EX=${to.lng}&EY=${to.lat}&OPT=0&output=json`

  const res = await fetchJson<OdsayResponse>(
    url,
    // Web 키는 도메인으로 식별하므로 등록한 Service URI 를 Referer 로 보낸다.
    { headers: { Referer: serverEnv.odsayReferer } },
    { label: 'ODsay 길찾기' },
  )
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.message,
    }
  }
  const json = res.data

  if (json.error) {
    return {
      ok: false,
      code: 'upstream-error',
      message: json.error.message ?? json.error.msg ?? `ODsay 오류 ${json.error.code ?? ''}`.trim(),
    }
  }

  const best = json.result?.path?.[0]
  if (!best || best.subPath.length === 0) {
    return { ok: false, code: 'no-data', message: '이 구간의 대중교통 경로를 찾지 못했습니다' }
  }

  const legs: WireLeg[] = best.subPath
    // 소요시간 0분짜리 자투리 구간은 화면만 어지럽힌다
    .filter((sub) => sub.sectionTime > 0)
    .map((sub, i, arr) => {
      const kind = TRAFFIC[sub.trafficType]
      return {
        kind,
        from: {
          name: sub.startName || (i === 0 ? from.name : '경유지'),
          lat: sub.startY,
          lng: sub.startX,
        },
        to: {
          name: sub.endName || (i === arr.length - 1 ? to.name : '경유지'),
          lat: sub.endY,
          lng: sub.endX,
        },
        durationMin: sub.sectionTime,
        carrier: kind === 'walk' ? undefined : laneName(sub),
        // ODsay 시간은 평시 기준 추정치다. 실시간이 아니다.
        confidence: kind === 'walk' ? 'estimated' : 'scheduled',
      }
    })

  if (legs.length === 0) {
    return { ok: false, code: 'no-data', message: '경로 구간이 비어 있습니다' }
  }

  return { ok: true, legs, totalMin: best.info.totalTime }
}
