import { serverEnv } from './env'
import { fetchJson } from './http'

const ROOT = 'https://apis.data.go.kr/1613000'

/**
 * TAGO 서비스별 엔드포인트.
 *
 * ⚠ 오퍼레이션 이름의 대소문자가 **서비스마다 다르다.** 실시간 계열은
 * 소문자로, 시각표 계열은 대문자로 시작한다. 반대로 부르면 조용히
 * "[12] 해당 오픈API 서비스가 없거나 폐기됨" 이 온다 — 키 문제로 착각하기 쉽다.
 * 아래 주석의 대소문자는 전부 실제로 찔러보고 확인한 것이다.
 */
export const TAGO = {
  train: 'TrainInfo', //          GetCtyCodeList / GetCtyAcctoTrainSttnList / GetStrtpntAlocFndTrainInfo
  expBus: 'ExpBusInfo', //        GetExpBusTrminlList / GetStrtpntAlocFndExpbusInfo
  suburbsBus: 'SuburbsBusInfo', //GetSuberbsBusTrminlList / GetStrtpntAlocFndSuberbsBusInfo
  subway: 'SubwayInfo', //        GetKwrdFndSubwaySttnList / GetSubwaySttnAcctoSchdulList
  flight: 'DmstcFlightNvgInfo', //GetArprtList / GetFlightOpratInfoList
  busArrival: 'ArvlInfoInqireService', // getSttnAcctoArvlPrearngeInfoList  ← 소문자
  busLocation: 'BusLcInfoInqireService', // getRouteAcctoBusLcList          ← 소문자
} as const

/**
 * 국내 열차 시각표(TAGO).
 *
 * ODsay 는 소요시간과 평균 배차만 준다. 이 앱의 알맹이인 역산은
 * **실제 출발 시각**이 있어야 의미가 있어서, 열차 구간만 여기서 채운다.
 */
export interface TrainRun {
  /** ISO 문자열. 클라이언트로 그대로 넘어간다. */
  departAt: string
  arriveAt: string
  /** "KTX", "ITX-새마을", "무궁화호" 등 */
  grade: string
  trainNo: string
  fare?: number
}

export interface TagoResponse<T> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string }
    body?: { totalCount?: number; items?: { item?: T | T[] } }
  }
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnAuthMsg?: string; returnReasonCode?: string } }
}

/** items.item 은 하나면 객체, 여럿이면 배열로 온다. */
export const asList = <T,>(v: T | T[] | undefined): T[] => (v ? (Array.isArray(v) ? v : [v]) : [])

/** 어느 TAGO 서비스든 부른다. 실패는 예외가 아니라 null 이다 — 화면이 빈 칸을 알린다. */
export async function tagoCall<T>(
  service: string,
  op: string,
  params: Record<string, string>,
): Promise<T[] | null> {
  if (!serverEnv.tagoKey) return null

  const query = new URLSearchParams({
    serviceKey: serverEnv.tagoKey,
    _type: 'json',
    numOfRows: '200',
    pageNo: '1',
    ...params,
  })
  const res = await fetchJson<TagoResponse<T>>(
    `${ROOT}/${service}/${op}?${query}`,
    {},
    { label: `TAGO ${service}` },
  )
  if (!res.ok) return null

  const err = res.data.OpenAPI_ServiceResponse?.cmmMsgHeader
  if (err) {
    console.error(`[tago] ${service}/${op}: ${err.returnAuthMsg} (${err.returnReasonCode})`)
    return null
  }
  return asList(res.data.response?.body?.items?.item)
}

const call = <T,>(op: string, params: Record<string, string>) =>
  tagoCall<T>(TAGO.train, op, params)

/* ---------------- 역 이름 → 코드 ---------------- */

interface CityRow { citycode?: number | string; cityname?: string }
interface StationRow { nodeid?: string; nodename?: string }

/**
 * 역 목록은 거의 바뀌지 않으므로 한 번 받아 오래 들고 있는다.
 * 도시마다 따로 불러야 해서 처음 한 번이 느리다.
 */
let stationMap: Map<string, string> | null = null
let loading: Promise<Map<string, string>> | null = null

async function loadStations(): Promise<Map<string, string>> {
  if (stationMap) return stationMap
  if (loading) return loading

  loading = (async () => {
    const map = new Map<string, string>()
    const cities = await call<CityRow>('GetCtyCodeList', {})
    for (const city of cities ?? []) {
      const code = String(city.citycode ?? '')
      if (!code) continue
      const stations = await call<StationRow>('GetCtyAcctoTrainSttnList', { cityCode: code })
      for (const st of stations ?? []) {
        if (st.nodename && st.nodeid && !map.has(st.nodename)) map.set(st.nodename, st.nodeid)
      }
    }
    stationMap = map
    console.log(`[tago] 역 ${map.size}곳 적재`)
    return map
  })()
  return loading
}

/**
 * 이름으로 역 코드를 찾는다.
 * ODsay 는 "대전", "동대구" 처럼 짧게 주고 TAGO 도 같은 표기를 쓴다.
 * 정확히 없으면 "역" 을 떼거나 붙여 한 번 더 본다.
 */
export async function findStation(name: string): Promise<string | null> {
  const map = await loadStations()
  const key = name.trim()
  return (
    map.get(key) ??
    map.get(key.replace(/역$/, '')) ??
    map.get(`${key}역`) ??
    null
  )
}

/* ---------------- 시각표 ---------------- */

interface TrainRow {
  depplandtime?: string | number
  arrplandtime?: string | number
  traingradename?: string
  trainno?: string | number
  adultcharge?: string | number
}

/**
 * "20260901063400" → Date.
 *
 * 자릿수가 서비스마다 다르다 — 고속버스·항공은 12자리(분까지),
 * 시외버스는 14자리(초까지)로 온다. 앞 12자리만 쓰면 둘 다 맞는다.
 */
export function parseStamp(v: string | number | undefined): Date | null {
  const s = String(v ?? '')
  if (s.length < 12) return null
  const d = new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
  )
  return Number.isNaN(d.getTime()) ? null : d
}

export const yyyymmdd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/**
 * 두 역 사이 열차 운행. 날짜가 넘어가는 여정을 위해 다음날까지 받는다.
 * 결과는 출발 시각 오름차순.
 */
export async function trainsBetween(
  depName: string,
  arrName: string,
  from: Date,
  days = 2,
): Promise<TrainRun[] | null> {
  const [depId, arrId] = await Promise.all([findStation(depName), findStation(arrName)])
  if (!depId || !arrId) return null

  const runs: TrainRun[] = []
  for (let i = 0; i < days; i++) {
    const day = new Date(from)
    day.setDate(day.getDate() + i)
    const rows = await call<TrainRow>('GetStrtpntAlocFndTrainInfo', {
      depPlaceId: depId,
      arrPlaceId: arrId,
      depPlandTime: yyyymmdd(day),
    })
    if (!rows) continue

    for (const row of rows) {
      const departAt = parseStamp(row.depplandtime)
      const arriveAt = parseStamp(row.arrplandtime)
      if (!departAt || !arriveAt) continue
      const fare = Number(row.adultcharge)
      runs.push({
        departAt: departAt.toISOString(),
        arriveAt: arriveAt.toISOString(),
        // 등급이 비어 오는 편이 있다(열차번호만 있는 경우)
        grade: row.traingradename?.trim() || '열차',
        trainNo: String(row.trainno ?? ''),
        fare: Number.isFinite(fare) && fare > 0 ? fare : undefined,
      })
    }
  }

  if (runs.length === 0) return null
  runs.sort((a, b) => a.departAt.localeCompare(b.departAt))
  return runs
}
