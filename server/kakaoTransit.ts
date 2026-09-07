import { serverEnv } from './env'
import { fetchJson } from './http'
import type { GeoPoint } from './geocode'
import type { LatLng, RouteResult, WireLeg, WireRoute } from './routeTypes'
import { encodePolyline } from './polyline'
import { betterAlightStop, busRegionFor } from './busRoutes'
import { distanceM } from './terminalIndex'

/**
 * 카카오 대중교통 길찾기.
 *
 * 2026-07-21 에 열린 API 다. ODsay 와 견줘 이 앱에 중요한 차이가 둘 있다:
 *
 * 1. **모든 구간의 실제 좌표를 준다 — 도보까지.** ODsay 는 도보 선형을 주지 않아
 *    산을 가로지르는 직선이 그려졌다. 선형이 같은 응답에 들어 있어 추가 호출도 없다.
 * 2. **시외를 못 한다.** BUS / SUBWAY / BUS_AND_SUBWAY 뿐이라 대전역→부산역은
 *    NO_RESULTS 다. 시외는 TAGO 시각표로 따로 엮는다.
 */
const TRANSIT_URL = 'https://dapi.kakao.com/v2/routing/publictraffic'
const WALK_URL = 'https://dapi.kakao.com/v2/routing/walk'

interface KakaoPath {
  points?: [number, number][]
}

interface KakaoStep {
  properties?: {
    guidance?: string
    type?: 'BUS' | 'SUBWAY' | 'WALKING'
    distance?: number
    time?: number
    stops?: { name?: string }[]
    vehicles?: { name?: string; type?: string }[]
  }
  path?: KakaoPath
}

interface KakaoRoute {
  properties?: {
    type?: string
    totalDistance?: number
    totalTime?: number
    transfers?: number
    fare?: { value?: number }
  }
  steps?: KakaoStep[]
}

interface TransitResponse {
  status?: string
  properties?: { total?: number; landingURL?: string }
  routes?: KakaoRoute[]
}

interface WalkResponse {
  status?: string
  route?: {
    legs?: {
      properties?: { distance?: number; time?: number }
      steps?: { path?: KakaoPath }[]
    }[]
  }
}

const KIND: Record<string, WireLeg['kind']> = {
  BUS: 'bus',
  SUBWAY: 'subway',
  WALKING: 'walk',
}

/** 카카오는 [x, y] = [경도, 위도] 로 준다. 뒤집어 쓰면 지도가 바다로 간다. */
const toLatLng = (points: [number, number][] | undefined): LatLng[] =>
  (points ?? []).map(([x, y]) => ({ lat: y, lng: x }))

const auth = () => ({ Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` })

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; routes: WireRoute[] }>()
const cacheKey = (a: GeoPoint, b: GeoPoint) =>
  `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`

/** 두 지점 사이 거리(m). 접근 도보를 구할 값어치가 있는지 가른다. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 이 아래로 떨어져 있으면 도보 구간을 따로 만들지 않는다. */
const ACCESS_MIN_M = 120

/**
 * 실제 도보 경로. 카카오 대중교통 응답에는 출발지→첫 정류장,
 * 마지막 정류장→목적지 구간이 빠져 있어 여기서 채운다.
 */
/*
 * 도보 구간은 같은 자리를 몇 번이고 다시 묻게 된다 — 경로 여덟 개가 같은
 * 정류장에서 목적지까지 걷고, 시외 후보 넷도 같은 터미널로 걸어간다.
 * 10m 눈금으로 접어 캐시한다.
 */
const walkCache = new Map<string, WireLeg | null>()
const walkKey = (a: GeoPoint, b: GeoPoint) =>
  `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`

/**
 * 곧은 거리로 어림한 도보. 길찾기가 실패했을 때 쓴다.
 *
 * 사람 걸음 4.5km/h 에, 길이 곧지 않은 만큼 20% 를 더한다. 실제보다 짧게
 * 나올 수는 있어도 **구간을 통째로 빼는 것보다는 낫다** — 빼면 "총 7분" 처럼
 * 걷는 시간이 아예 없는 답이 나가고, 그 시각에 나선 사람은 차를 놓친다.
 */
function guessWalk(from: GeoPoint, to: GeoPoint): WireLeg {
  const straight = metres(from, to)
  return {
    kind: 'walk',
    from: { name: from.name, lat: from.lat, lng: from.lng },
    to: { name: to.name, lat: to.lat, lng: to.lng },
    durationMin: Math.max(1, Math.round((straight * 1.2) / 75)),
    confidence: 'estimated',
  }
}

export async function walkLeg(from: GeoPoint, to: GeoPoint): Promise<WireLeg | null> {
  if (metres(from, to) < ACCESS_MIN_M) return null

  const key = walkKey(from, to)
  const hit = walkCache.get(key)
  if (hit !== undefined) {
    // 이름은 부르는 쪽마다 다르므로 좌표만 재사용하고 이름은 새로 붙인다
    return hit && { ...hit, from: { ...hit.from, name: from.name }, to: { ...hit.to, name: to.name } }
  }

  const url =
    `${WALK_URL}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}`
  const res = await fetchJson<WalkResponse>(url, { headers: auth() }, { label: '카카오 도보' })

  /*
   * 길찾기가 실패하면 어림값으로 채운다.
   *
   * 카카오 도보 길찾기는 하루 한도가 따로 있어서, 붐비는 날에는 400
   * ("API limit has been exceeded")이 온다. 예전에는 그때 null 을 돌려줘
   * 걷는 구간이 통째로 빠졌다 — 청주 성안길 → 충북대가 "총 7분" 으로 나왔다.
   * 걸어야 하는 것은 사실이므로, 못 물어봤다고 없던 일로 만들지 않는다.
   */
  if (!res.ok || res.data.status !== 'OK') {
    const guess = guessWalk(from, to)
    walkCache.set(key, guess)
    return guess
  }

  const leg = res.data.route?.legs?.[0]
  const minutes = Math.max(1, Math.round((leg?.properties?.time ?? 0) / 60))
  const shape = (leg?.steps ?? []).flatMap((s) => toLatLng(s.path?.points))

  const out: WireLeg = {
    kind: 'walk',
    from: { name: from.name, lat: from.lat, lng: from.lng },
    to: { name: to.name, lat: to.lat, lng: to.lng },
    durationMin: minutes,
    confidence: 'estimated',
    shape: shape.length > 1 ? encodePolyline(shape) : undefined,
  }
  walkCache.set(key, out)
  return out
}

function toLegs(route: KakaoRoute): WireLeg[] {
  const steps = route.steps ?? []
  const fare = route.properties?.fare?.value
  let farePlaced = false

  return steps.map((step) => {
    const p = step.properties ?? {}
    const kind = KIND[p.type ?? ''] ?? 'bus'
    const points = step.path?.points ?? []
    const shape = toLatLng(points)
    const stops = p.stops ?? []

    const head = points[0]
    const tail = points[points.length - 1]
    const name = (i: 0 | -1, fallback: string) =>
      (i === 0 ? stops[0]?.name : stops[stops.length - 1]?.name)?.trim() || fallback

    const carrier =
      kind === 'walk'
        ? undefined
        : (p.vehicles ?? []).map((v) => v.name).filter(Boolean).join(', ') || undefined

    // 요금은 경로 단위로 온다. 첫 탈것 구간에 한 번만 붙인다.
    const legFare = kind !== 'walk' && !farePlaced && fare ? ((farePlaced = true), fare) : undefined

    return {
      kind,
      from: { name: name(0, '출발'), lat: head?.[1], lng: head?.[0] },
      to: { name: name(-1, '도착'), lat: tail?.[1], lng: tail?.[0] },
      durationMin: Math.max(1, Math.round((p.time ?? 0) / 60)),
      carrier,
      // 카카오도 시각표가 아니라 평시 소요시간을 준다
      confidence: 'estimated',
      fare: legFare,
      shape: shape.length > 1 ? encodePolyline(shape) : undefined,
      // 지하철은 TAGO 시각표를 붙일 수 있다. 시내버스는 해당 서비스가 없다.
      tagoKind: kind === 'subway' ? 'subway' : undefined,
    }
  })
}


/** 걸어서 이 거리를 가는 데 걸리는 시간(분). 사람 걸음 4.5km/h 로 본다. */
const walkMinFor = (meters: number) => Math.max(1, Math.round(meters / 75))

/**
 * 종점 앞에서 내리라는 안내를 바로잡는다.
 *
 * 카카오는 목적지에서 가까운 정류소가 아니라 **자기가 고른 정류소**에서
 * 내리라고 한다. 브라더냉동 → 목원대학교에서 603 번은 목원대학교가
 * 종점(순번 100)인데 한 정거장 앞(순번 99, 어울림하트 12단지)에서 내려
 * 22분을 걸으라고 했다. 종점까지 타면 목적지 420m 앞이다.
 *
 * 마지막 탈것 구간만 본다. 중간 구간을 늘리면 환승이 어긋난다.
 * 그리고 **걸어야 할 거리가 충분히 멀 때만** 본다 — 이미 코앞에 내려주는데
 * 노선 정보를 조회하는 건 낭비다.
 *
 * 더 타는 시간은 **어림한다.** TAGO 노선정보는 정류소 사이 소요 시간을 주지
 * 않는다. 그래서 방금 탄 구간의 평균 속도를 그대로 적용한다 — 같은 노선의
 * 바로 이어지는 구간이므로 근거 없는 값은 아니다. 구간은 원래도
 * `confidence: 'estimated'` 라 표시가 달라지지 않는다.
 */
async function rideFurtherIfCloser(
  legs: WireLeg[],
  origin: GeoPoint,
  dest: GeoPoint,
): Promise<WireLeg[]> {
  /*
   * 먼 길에서는 보지 않는다.
   *
   * 세 시간짜리 여정에서 마지막 도보 5분을 줄이는 건 거의 뜻이 없는데,
   * 카카오가 엮어주는 시내버스 사슬에는 노선 번호가 잔뜩 붙어 있어 조회만
   * 잔뜩 하게 된다 — 서울 → 부산 검색이 25초까지 늘어졌던 이유다.
   * 그런 구간은 어차피 시외 조합이 답을 낸다.
   */
  if (distanceM(origin, dest) > 30000) return legs

  /*
   * **마지막으로 타는 것**이 버스일 때만 본다.
   *
   * 예전에는 "마지막 버스 구간" 을 찾았는데, 그 뒤에 지하철이 오면 그 버스는
   * 목적지가 아니라 환승역으로 가는 길이다. 그걸 늘리면 갈아탈 곳을 지나쳐
   * 버린다 — 서울 강남역 → 건국대에서 논현역 대신 광림교회까지 타라는
   * 답이 나왔다. 둘 다 건국대와는 멀다.
   */
  const rides = legs.map((l, idx) => ({ l, idx })).filter((x) => x.l.kind !== 'walk')
  const tail = rides[rides.length - 1]
  if (!tail || tail.l.kind !== 'bus') return legs
  const i = tail.idx
  const leg = legs[i]
  if (typeof leg.to.lat !== 'number' || typeof leg.to.lng !== 'number' || !leg.carrier) return legs

  const gapM = distanceM(dest, { lat: leg.to.lat, lng: leg.to.lng })
  if (gapM < 500) return legs // 이미 가깝다 — 조회할 값이 없다

  const region = await busRegionFor(dest)
  if (region === null) return legs

  /*
   * 노선 번호를 두 개까지만 본다.
   *
   * 한 구간에 "115, 213, 601" 처럼 여러 번호가 붙는 건 셋이 같은 구간을
   * 함께 달린다는 뜻이라, 어느 하나만 봐도 대개 답이 같다. 전부 보면
   * 경로 여덟 개 × 번호 셋 × 조회 두 번이 되어 한 번 검색에 스무 번 넘게
   * TAGO 를 부른다 — 실제로 서울 → 부산이 25초까지 늘어졌다.
   */
  const nos = leg.carrier.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 2)
  const better = await betterAlightStop(
    nos,
    { name: leg.to.name, lat: leg.to.lat, lng: leg.to.lng },
    dest,
    region,
  )
  if (!better) return legs

  // 방금 탄 구간의 속도로 다음 정류장까지를 어림한다
  const ridden = distanceM({ lat: leg.from.lat!, lng: leg.from.lng! }, { lat: leg.to.lat, lng: leg.to.lng })
  const extraM = distanceM({ lat: leg.to.lat, lng: leg.to.lng }, better)
  const extraMin =
    ridden > 0 ? Math.max(1, Math.round((leg.durationMin * extraM) / ridden)) : better.extraStops * 2

  // 더 타는 시간보다 아끼는 걷기가 커야 뜻이 있다
  if (extraMin >= walkMinFor(better.savedM)) return legs

  const out = [...legs]
  out[i] = {
    ...leg,
    to: { name: better.name, lat: better.lat, lng: better.lng },
    durationMin: leg.durationMin + extraMin,
    // 늘린 구간의 실제 길은 모른다. 원래 길만 그리면 선이 끊겨 보이므로 지운다.
    shape: undefined,
  }
  return out
}

/**
 * 시내 대중교통 경로. 시외 구간은 NO_RESULTS 로 돌아오므로
 * 호출한 쪽이 그때 시외 조합으로 넘어가면 된다.
 */
export async function searchTransitKakao(
  from: GeoPoint,
  to: GeoPoint,
  /**
   * 몇 개까지 만들 것인가.
   *
   * 시외 조합의 접근 구간(`connect`)은 **첫 번째 하나만** 쓰는데도 여덟 개를
   * 다 만들고 있었다. 경로마다 앞뒤로 도보를 물으므로 쓰지도 않을 조회가
   * 열네 번씩 나갔고, 카카오 도보 길찾기의 하루 한도를 그렇게 태웠다.
   */
  limit = 8,
): Promise<RouteResult> {
  if (!serverEnv.kakaoRestKey) {
    return { ok: false, code: 'no-credentials', message: 'KAKAO_REST_API_KEY 가 없습니다' }
  }

  const key = `${cacheKey(from, to)}|${limit}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, routes: hit.routes }

  const url =
    `${TRANSIT_URL}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}` +
    `&s_name=${encodeURIComponent(from.name)}&e_name=${encodeURIComponent(to.name)}`
  const res = await fetchJson<TransitResponse>(url, { headers: auth() }, { label: '카카오 대중교통' })
  if (!res.ok) {
    return {
      ok: false,
      code: res.kind === 'status' ? 'upstream-error' : 'network',
      message: res.message,
    }
  }

  const status = res.data.status
  if (status !== 'OK') {
    // 시외이거나(NO_RESULTS) 근처에 정류장이 없다(STARTNODES_NULL).
    // 어느 쪽이든 "이 방법으로는 못 찾았다" 는 사실만 전한다.
    return { ok: false, code: 'no-data', message: `카카오 대중교통 결과 없음 (${status})` }
  }

  const routes: WireRoute[] = []
  /*
   * 카카오가 주는 것을 넉넉히 받는다.
   *
   * 셋만 받고 있었는데, 카카오의 정렬은 우리 기준(도보·환승)과 다르다.
   * 실제로 브라더냉동 → 목원대학교에서 카카오는 열한 개를 줬고 그중
   * 목원대학교 정류장까지 들어가는 706번 경로가 있었는데, 앞의 셋에 안
   * 들어서 통째로 사라졌다. 남은 셋은 전부 900m 밖에 내려 20분씩 걷는 길이라
   * "도보를 줄이려면 이 길" 이라고 내놓을 것이 없었다.
   *
   * 여덟인 이유: 같은 길이 접히고 나면 실제로 다른 길은 서너 개로 줄어드는데,
   * 그 서너 개를 확보하려면 이만큼은 봐야 한다. 응답이 커지는 값은
   * 좌표를 접어 보내면서 이미 치렀다(332KB → 95KB).
   */
  /*
   * 경로마다 종점 확인이 붙으므로 나란히 돌린다. 서로를 모르는 일이라
   * 줄 세울 이유가 없는데, 순서대로 하면 한 번 검색이 몇 초씩 늘어난다.
   */
  const extended = await Promise.all(
    (res.data.routes ?? []).slice(0, limit).map((r) => rideFurtherIfCloser(toLegs(r), from, to)),
  )
  for (const legs of extended) {
    if (legs.length === 0) continue

    const first = legs[0]
    const last = legs[legs.length - 1]
    const access =
      typeof first.from.lat === 'number' && typeof first.from.lng === 'number'
        ? await walkLeg(from, { name: first.from.name, lat: first.from.lat, lng: first.from.lng })
        : null
    const egress =
      typeof last.to.lat === 'number' && typeof last.to.lng === 'number'
        ? await walkLeg({ name: last.to.name, lat: last.to.lat, lng: last.to.lng }, to)
        : null

    const all = [...(access ? [access] : []), ...legs, ...(egress ? [egress] : [])]
    routes.push({
      legs: all,
      totalMin: all.reduce((sum, l) => sum + l.durationMin, 0),
    })
  }

  if (routes.length === 0) {
    return { ok: false, code: 'no-data', message: '경로를 찾지 못했습니다' }
  }
  cache.set(key, { at: Date.now(), routes })
  return { ok: true, routes }
}
