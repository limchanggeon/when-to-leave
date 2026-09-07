import { tagoCall } from './tago'
import { serverEnv } from './env'
import { fetchJson } from './http'
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

/**
 * 어느 자료로 노선을 찾을 것인가.
 *
 * TAGO 는 지자체가 넘겨준 것만 담는데 **서울시는 빠져 있다** — 자체 API 를
 * 쓰기 때문이다. 그래서 서울은 서울시 API(ws.bus.go.kr)로 따로 묻는다.
 * 인증키는 같은 공공데이터포털 키를 쓴다.
 */
export type BusRegion = { kind: 'tago'; cityCode: number } | { kind: 'seoul' }

/*
 * 서울 경계를 네모로 어림한다. 정확한 행정 경계가 필요한 일이 아니다 —
 * 어느 자료에 먼저 물어볼지만 정하면 되고, 잘못 골라도 정류장 이름과 좌표를
 * 함께 보는 관문이 엉뚱한 노선을 걸러낸다.
 */
const SEOUL_BOX = { minLat: 37.41, maxLat: 37.71, minLng: 126.76, maxLng: 127.19 }
const inSeoul = (p: { lat: number; lng: number }) =>
  p.lat >= SEOUL_BOX.minLat && p.lat <= SEOUL_BOX.maxLat &&
  p.lng >= SEOUL_BOX.minLng && p.lng <= SEOUL_BOX.maxLng

/* 노선 정보는 거의 바뀌지 않는다. 프로세스가 사는 동안 들고 있는다. */
const cityCache = new Map<string, number | null>()
const routeCache = new Map<string, Stop[][]>()

/** 이 좌표의 버스 노선을 어느 자료에서 찾을지. */
export async function busRegionFor(point: { lat: number; lng: number }): Promise<BusRegion | null> {
  if (inSeoul(point)) return { kind: 'seoul' }
  const code = await cityCodeNear(point)
  return code === null ? null : { kind: 'tago', cityCode: code }
}

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


/*
 * 서울시 버스 노선 조회(ws.bus.go.kr).
 *
 * **https 가 안 된다.** 인증서 문제로 TLS 핸드셰이크가 실패해서 http 로 부른다.
 * 서버끼리의 호출이고 노선 정류장 목록에는 비밀이 없으므로 감수한다 —
 * 인증키는 쿼리로 나가지만 이건 공공데이터포털 키라 원래 그렇게 쓴다.
 */
const SEOUL_ROOT = 'http://ws.bus.go.kr/api/rest'

interface SeoulItem {
  seq?: string
  stationNm?: string
  gpsX?: string
  gpsY?: string
  busRouteId?: string
  busRouteNm?: string
}

async function seoulCall(path: string): Promise<SeoulItem[] | null> {
  if (!serverEnv.tagoKey) return null
  const url = `${SEOUL_ROOT}/${path}&serviceKey=${encodeURIComponent(serverEnv.tagoKey)}&resultType=json`
  const res = await fetchJson<{ msgBody?: { itemList?: SeoulItem[] } }>(
    url,
    {},
    { label: '서울 버스 노선' },
  )
  if (!res.ok) return null
  return res.data.msgBody?.itemList ?? []
}

async function seoulRouteStops(routeNo: string): Promise<Stop[][]> {
  const found = await seoulCall(`busRouteInfo/getBusRouteList?strSrch=${encodeURIComponent(routeNo)}`)
  // 부분 일치로도 오므로(5 를 물으면 5511 도 온다) 번호가 정확히 같은 것만 본다
  const exact = (found ?? []).filter((r) => (r.busRouteNm ?? '').trim() === routeNo)

  const out: Stop[][] = []
  for (const r of exact.slice(0, 3)) {
    if (!r.busRouteId) continue
    const rows = await seoulCall(`busRouteInfo/getStaionByRoute?busRouteId=${r.busRouteId}`)
    const stops = (rows ?? [])
      .map((s) => ({
        ord: Number(s.seq),
        name: (s.stationNm ?? '').trim(),
        lat: Number(s.gpsY),
        lng: Number(s.gpsX),
      }))
      .filter((s) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .sort((a, b) => a.ord - b.ord)
    if (stops.length) out.push(stops)
  }
  return out
}

/**
 * 이 지자체의 이 번호 노선이 지나는 정류소를, 순서대로.
 *
 * 같은 번호가 여러 노선일 수 있다(지선·급행). 전부 돌려주고 고르는 건
 * 부르는 쪽 몫이다 — 어느 쪽을 탔는지는 정류소 이름이 알려준다.
 */
export async function routeStops(region: BusRegion, routeNo: string): Promise<Stop[][]> {
  const key = `${region.kind === 'seoul' ? 'seoul' : region.cityCode}:${routeNo}`
  const hit = routeCache.get(key)
  if (hit) return hit

  if (region.kind === 'seoul') {
    const out = await seoulRouteStops(routeNo)
    routeCache.set(key, out)
    return out
  }
  const cityCode = region.cityCode

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
  routeCache.set(key, out)
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
 * 내린 정류장을 노선에서 찾을 때 **좌표로 짚는다.** 이름으로 찾으면 안 된다 —
 * 노선 목록은 갈 때와 올 때를 한 줄로 이어 붙여 주므로 같은 이름이 두 번
 * 나온다. 603 번은 100곳 중 31곳이 그렇다(목원대학교가 순번 1과 100).
 * 이름으로 첫 번째를 잡으면 반대 방향의 정류장을 짚어, 왔던 길을 되돌아가라는
 * 답이 나온다.
 *
 * 짚은 자리 **뒤쪽**만 본다. 앞쪽을 보면 역시 되돌아가라는 말이 된다.
 *
 * 아끼는 거리가 얼마 안 되면 그냥 둔다. 몇십 미터 때문에 한 정거장을 더
 * 가라고 하면, 내려서 걷는 편이 나은 경우까지 바꿔버린다.
 */
const MIN_SAVED_M = 250
/** 이보다 많이 더 타라고는 하지 않는다. 종점을 지나 되돌아오는 노선도 있다. */
const MAX_EXTRA_STOPS = 4
/** 내린 정류장을 노선에서 짚을 때, 이보다 멀면 같은 정류장이 아니다. */
const SAME_STOP_M = 200

export async function betterAlightStop(
  routeNos: string[],
  alight: { name: string; lat: number; lng: number },
  dest: { lat: number; lng: number },
  region: BusRegion,
): Promise<BetterStop | null> {
  let best: BetterStop | null = null

  for (const no of routeNos) {
    let variants: Stop[][]
    try {
      variants = await routeStops(region, no)
    } catch {
      continue // 노선 정보를 못 받으면 그냥 원래대로 둔다
    }

    for (const stops of variants) {
      /*
       * 내린 자리를 좌표로 짚는다. 이름이 같은 후보가 여럿이면
       * 실제로 내린 지점에 가장 가까운 것이 맞는 방향이다.
       */
      let here = -1
      let bestGap = SAME_STOP_M
      for (const [i, st] of stops.entries()) {
        if (st.name !== alight.name) continue
        const gap = distanceM(alight, st)
        if (gap < bestGap) {
          bestGap = gap
          here = i
        }
      }
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
