import { tagoCall } from './tago'
import { distanceM } from './terminalIndex'

/**
 * 시내버스 노선의 경유 정류소. TAGO 버스노선정보(1613000)를 쓴다.
 *
 * 왜 필요한가: 카카오 길찾기는 종점 앞에서 내리라고 하는 일이 있다.
 * 브라더냉동 → 목원대학교에서 603 번은 목원대학교가 **종점**(순번 100)인데,
 * 카카오는 한 정거장 앞인 어울림하트 12단지(순번 99)에서 내려 22분을 걸으라고
 * 했다. 종점까지 타면 목적지 420m 앞이다.
 *
 * 노선의 정류소 순서를 알아야 "더 가도 되는가" 를 판단할 수 있다.
 */
export interface Stop {
  /** 노선 안에서의 순번. 이걸로 앞뒤를 가른다. */
  ord: number
  name: string
  lat: number
  lng: number
}

/* 노선 정보는 거의 바뀌지 않는다. 프로세스가 사는 동안 들고 있는다. */
const cityCache = new Map<string, number | null>()
const routeCache = new Map<string, Stop[] | null>()

/** 이 좌표가 어느 지자체인가. 근처 정류소가 알려준다. */
export async function cityCodeNear(point: { lat: number; lng: number }): Promise<number | null> {
  const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`
  const hit = cityCache.get(key)
  if (hit !== undefined) return hit

  const rows = await tagoCall<{ citycode?: number }>(
    'BusSttnInfoInqireService',
    'getCrdntPrxmtSttnList',
    { gpsLati: String(point.lat), gpsLong: String(point.lng), numOfRows: '5' },
  )
  const code = rows?.find((r) => r.citycode)?.citycode ?? null
  cityCache.set(key, code)
  return code
}

/**
 * 이 지자체의 이 번호 노선이 지나는 정류소를, 순서대로.
 *
 * 같은 번호가 여러 노선일 수 있다(지선·급행). 전부 돌려주고 고르는 건
 * 부르는 쪽 몫이다 — 어느 쪽을 탔는지는 정류소 이름이 알려준다.
 */
export async function routeStops(cityCode: number, routeNo: string): Promise<Stop[][]> {
  const key = `${cityCode}:${routeNo}`
  const hit = routeCache.get(key)
  if (hit !== undefined) return hit ? [hit] : []

  const routes = await tagoCall<{ routeid?: string; routeno?: string }>(
    'BusRouteInfoInqireService',
    'getRouteNoList',
    { cityCode: String(cityCode), routeNo, numOfRows: '20' },
  )
  // 번호가 부분 일치로도 오므로(6 을 물으면 603 도 온다) 정확히 같은 것만 본다
  const exact = (routes ?? []).filter((r) => String(r.routeno).trim() === routeNo)

  const out: Stop[][] = []
  for (const r of exact.slice(0, 3)) {
    if (!r.routeid) continue
    const rows = await tagoCall<{
      nodeord?: number
      nodenm?: string
      gpslati?: number
      gpslong?: number
    }>('BusRouteInfoInqireService', 'getRouteAcctoThrghSttnList', {
      cityCode: String(cityCode),
      routeId: r.routeid,
      numOfRows: '500',
    })
    const stops = (rows ?? [])
      .map((s) => ({
        ord: Number(s.nodeord),
        name: (s.nodenm ?? '').trim(),
        lat: Number(s.gpslati),
        lng: Number(s.gpslong),
      }))
      .filter((s) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .sort((a, b) => a.ord - b.ord)
    if (stops.length) out.push(stops)
  }
  routeCache.set(key, out[0] ?? null)
  return out
}

export interface BetterStop {
  name: string
  lat: number
  lng: number
  /** 몇 정거장 더 가는가. 걸리는 시간을 어림하는 데 쓴다. */
  extraStops: number
  /** 목적지까지 몇 m 를 줄이는가. */
  savedM: number
}

/**
 * 같은 노선을 조금 더 타면 목적지에 더 가까워지는가.
 *
 * 내린 정류소를 노선에서 찾아, **그 뒤쪽** 정류소들만 본다. 앞쪽을 보면
 * 왔던 길을 되돌아가라는 말이 된다.
 *
 * 아끼는 거리가 얼마 안 되면 그냥 둔다. 몇십 미터 때문에 한 정거장을 더
 * 가라고 하면, 내려서 걷는 편이 나은 경우까지 바꿔버린다.
 */
const MIN_SAVED_M = 250
/** 이보다 많이 더 타라고는 하지 않는다. 종점을 지나 되돌아오는 노선도 있다. */
const MAX_EXTRA_STOPS = 4

export async function betterAlightStop(
  routeNos: string[],
  alightName: string,
  dest: { lat: number; lng: number },
  cityCode: number,
): Promise<BetterStop | null> {
  let best: BetterStop | null = null

  for (const no of routeNos) {
    let variants: Stop[][]
    try {
      variants = await routeStops(cityCode, no)
    } catch {
      continue // 노선 정보를 못 받으면 그냥 원래대로 둔다
    }

    for (const stops of variants) {
      const here = stops.findIndex((s) => s.name === alightName)
      if (here < 0) continue
      const nowM = distanceM(dest, stops[here])

      for (let i = here + 1; i < stops.length && i - here <= MAX_EXTRA_STOPS; i++) {
        const saved = nowM - distanceM(dest, stops[i])
        if (saved < MIN_SAVED_M) continue
        if (!best || saved > best.savedM) {
          best = {
            name: stops[i].name,
            lat: stops[i].lat,
            lng: stops[i].lng,
            extraStops: i - here,
            savedM: Math.round(saved),
          }
        }
      }
    }
  }
  return best
}
