import { TAGO, parseStamp, tagoCall, yyyymmdd } from './tago'

/**
 * TAGO 시각표 — 고속버스·시외버스·항공·지하철.
 *
 * 열차(tago.ts)와 목적이 같다. ODsay 는 소요시간과 평균 배차만 주는데
 * 이 앱의 알맹이인 역산은 **실제 출발 시각**이 있어야 성립한다.
 * 여기서 채운 구간은 엔진에서 이산 구간이 되어 데드라인을 앞으로 전파한다.
 */
export interface Run {
  departAt: string
  arriveAt: string
  /** "우등 대전복합→서울경부", "OZ8901 아시아나 항공" 처럼 화면에 그대로 쓰는 이름 */
  carrier: string
  fare?: number
}

/* ---------------- 이름 → 코드 ---------------- */

/**
 * 이름 대조용으로 다듬는다.
 *
 * ODsay 는 "유성복합터미널", TAGO 는 "유성복합" 처럼 표기가 어긋난다.
 * 흔한 꼬리말을 떼고 공백·괄호를 지워야 겨우 만난다.
 */
export function normalize(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    // "김포국제공항" 과 "김포공항" 을 같은 것으로 본다
    .replace(/국제공항$/, '공항')
    // 꼬리말을 뗀다. 어디까지 떼느냐가 미묘하다:
    //   "대전복합터미널"     → "대전복합"  (TAGO 도 "대전복합")
    //   "부산종합버스터미널" → "부산"      (TAGO 는 그냥 "부산")
    // "복합" 은 이름의 일부라 남기고 "종합버스" 는 꼬리말이라 뗀다.
    .replace(/(종합|고속|시외|공용|여객)?(버스)?터미널$/, '')
    .replace(/[\s·．.]/g, '')
    /*
     * 공항 여객터미널 번호 표기를 맞춘다.
     *   TAGO   "인천공항T1"        → 인천공항1
     *   카카오 "인천공항1버스터미널" → 인천공항1  (위에서 꼬리말이 떨어진다)
     * 이게 없으면 둘이 만나지 못해, 인천공항으로 가는 공항버스가 후보에서
     * 통째로 빠지고 환승 세 번짜리 시내 경로가 답이 된다.
     */
    .replace(/T(\d)$/i, '$1')
    .trim()
}

/**
 * 규칙으로 안 되는 것들. 표기가 아예 다른 큰 터미널만 손으로 적는다.
 * 늘리기 전에 normalize 로 풀리는지 먼저 볼 것.
 */
const ALIASES: Record<string, string> = {
  서울고속버스: '서울경부',
  서울고속버스터미널: '서울경부',
  강남고속버스: '서울경부',
  센트럴시티: '센트럴시티',
}

type Lookup = { byExact: Map<string, string>; byLoose: Map<string, string> }

function indexBy<T>(rows: T[], id: (r: T) => string, name: (r: T) => string): Lookup {
  const byExact = new Map<string, string>()
  const byLoose = new Map<string, string>()
  for (const r of rows) {
    const n = name(r)?.trim()
    const i = id(r)
    if (!n || !i) continue
    if (!byExact.has(n)) byExact.set(n, i)
    const loose = normalize(n)
    if (loose && !byLoose.has(loose)) byLoose.set(loose, i)
  }
  return { byExact, byLoose }
}

function find(lookup: Lookup, name: string): string | null {
  const raw = name.trim()
  const loose = normalize(raw)
  return (
    lookup.byExact.get(raw) ??
    lookup.byLoose.get(loose) ??
    lookup.byLoose.get(normalize(ALIASES[loose] ?? '')) ??
    null
  )
}

/** 목록은 거의 바뀌지 않으므로 한 번 받아 프로세스가 사는 동안 들고 있는다. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: T | null = null
  let inflight: Promise<T> | null = null
  return () => {
    if (cached) return Promise.resolve(cached)
    if (!inflight) {
      inflight = load().then((v) => {
        cached = v
        inflight = null
        return v
      })
    }
    return inflight
  }
}

interface TerminalRow { terminalId?: string; terminalNm?: string }
interface AirportRow { airportId?: string; airportNm?: string }

const expTerminals = once(async () => {
  const rows = (await tagoCall<TerminalRow>(TAGO.expBus, 'GetExpBusTrminlList', { numOfRows: '2000' })) ?? []
  const l = indexBy(rows, (r) => r.terminalId ?? '', (r) => r.terminalNm ?? '')
  console.log(`[tago] 고속버스 터미널 ${l.byExact.size}곳`)
  return l
})

const suburbsTerminals = once(async () => {
  const rows = (await tagoCall<TerminalRow>(TAGO.suburbsBus, 'GetSuberbsBusTrminlList', { numOfRows: '2000' })) ?? []
  const l = indexBy(rows, (r) => r.terminalId ?? '', (r) => r.terminalNm ?? '')
  console.log(`[tago] 시외버스 터미널 ${l.byExact.size}곳`)
  return l
})

const airports = once(async () => {
  const rows = (await tagoCall<AirportRow>(TAGO.flight, 'GetArprtList', { numOfRows: '200' })) ?? []
  const l = indexBy(rows, (r) => r.airportId ?? '', (r) => r.airportNm ?? '')
  console.log(`[tago] 공항 ${l.byExact.size}곳`)
  return l
})

/* ---------------- 시각표 ---------------- */

interface BusRow {
  depPlandTime?: string | number
  arrPlandTime?: string | number
  charge?: string | number
  gradeNm?: string
}

interface FlightRow {
  depPlandTime?: string | number
  arrPlandTime?: string | number
  economyCharge?: string | number
  airlineNm?: string
  vihicleId?: string
}

const money = (v: unknown): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** 오늘부터 days 일치를 모아 출발 시각 오름차순으로 돌려준다. */
async function overDays<T>(
  from: Date,
  days: number,
  fetch: (yyyymmdd: string) => Promise<T[] | null>,
  toRun: (row: T) => Run | null,
): Promise<Run[] | null> {
  const runs: Run[] = []
  for (let i = 0; i < days; i++) {
    const day = new Date(from)
    day.setDate(day.getDate() + i)
    const rows = await fetch(yyyymmdd(day))
    for (const row of rows ?? []) {
      const run = toRun(row)
      if (run) runs.push(run)
    }
  }
  if (runs.length === 0) return null
  runs.sort((a, b) => a.departAt.localeCompare(b.departAt))
  return runs
}

const busRun = (row: BusRow): Run | null => {
  const departAt = parseStamp(row.depPlandTime)
  const arriveAt = parseStamp(row.arrPlandTime)
  if (!departAt || !arriveAt) return null
  return {
    departAt: departAt.toISOString(),
    arriveAt: arriveAt.toISOString(),
    carrier: row.gradeNm?.trim() || '버스',
    fare: money(row.charge),
  }
}

/** 고속버스. 터미널 이름이 안 맞으면 null — 없는 시각을 지어내지 않는다. */
export async function expressBusesBetween(
  depName: string,
  arrName: string,
  from: Date,
  days = 2,
): Promise<Run[] | null> {
  const t = await expTerminals()
  const dep = find(t, depName)
  const arr = find(t, arrName)
  if (!dep || !arr) return null

  return overDays(
    from,
    days,
    (d) =>
      tagoCall<BusRow>(TAGO.expBus, 'GetStrtpntAlocFndExpbusInfo', {
        depTerminalId: dep,
        arrTerminalId: arr,
        depPlandTime: d,
      }),
    busRun,
  )
}

/** 시외버스. 고속과 터미널 코드 체계가 다르다(NAEK… vs NAI…). */
export async function suburbsBusesBetween(
  depName: string,
  arrName: string,
  from: Date,
  days = 2,
): Promise<Run[] | null> {
  const t = await suburbsTerminals()
  const dep = find(t, depName)
  const arr = find(t, arrName)
  if (!dep || !arr) return null

  return overDays(
    from,
    days,
    (d) =>
      tagoCall<BusRow>(TAGO.suburbsBus, 'GetStrtpntAlocFndSuberbsBusInfo', {
        depTerminalId: dep,
        arrTerminalId: arr,
        depPlandTime: d,
      }),
    busRun,
  )
}

/** 국내선 항공. */
export async function flightsBetween(
  depName: string,
  arrName: string,
  from: Date,
  days = 2,
): Promise<Run[] | null> {
  const a = await airports()
  const dep = find(a, depName)
  const arr = find(a, arrName)
  if (!dep || !arr) return null

  return overDays(
    from,
    days,
    (d) =>
      tagoCall<FlightRow>(TAGO.flight, 'GetFlightOpratInfoList', {
        depAirportId: dep,
        arrAirportId: arr,
        depPlandTime: d,
      }),
    (row) => {
      const departAt = parseStamp(row.depPlandTime)
      const arriveAt = parseStamp(row.arrPlandTime)
      if (!departAt || !arriveAt) return null
      return {
        departAt: departAt.toISOString(),
        arriveAt: arriveAt.toISOString(),
        carrier: [row.vihicleId, row.airlineNm].filter(Boolean).join(' ').trim() || '항공',
        fare: money(row.economyCharge),
      }
    },
  )
}

/* ---------------- 지하철 ---------------- */

interface SubwayStationRow {
  subwayStationId?: string
  subwayStationName?: string
  subwayRouteName?: string
}

interface SubwaySchedRow {
  depTime?: string
  arrTime?: string
  endSubwayStationId?: string
  endSubwayStationNm?: string
  subwayRouteId?: string
}

/**
 * 역 ID 를 (노선 접두어, 순번) 으로 쪼갠다.
 *
 * TAGO 의 지하철 역 ID 는 노선 위 순서를 담고 있다 —
 * 강남 MTRS1**2222**, 역삼 **2221**, 삼성 **2219** 처럼 이웃끼리 번호가 붙어 있다.
 * 노선의 역 순서를 주는 API 가 따로 없어서(오퍼레이션이 4개뿐이다)
 * 상·하행을 가릴 근거가 이것밖에 없다.
 */
function splitId(id: string): { prefix: string; order: number } | null {
  const m = /^(.*?)(\d+)$/.exec(id)
  if (!m) return null
  return { prefix: m[1], order: Number(m[2]) }
}


async function subwayCandidates(name: string): Promise<SubwayStationRow[]> {
  const clean = name.replace(/\(.*?\)/g, '').replace(/역$/, '').trim()
  const rows =
    (await tagoCall<SubwayStationRow>(TAGO.subway, 'GetKwrdFndSubwaySttnList', {
      subwayStationName: clean,
      numOfRows: '50',
    })) ?? []
  // 키워드 검색이라 "강남" 에 "강남대", "강남구청" 까지 딸려온다.
  // 이름이 정확히 같은 것을 앞으로 보낸다.
  const exact = (r: SubwayStationRow) =>
    (r.subwayStationName ?? '').replace(/\(.*?\)/g, '').trim() === clean
  return [...rows.filter(exact), ...rows.filter((r) => !exact(r))]
}

/**
 * 같은 노선에 있는 짝을 고른다.
 *
 * "강남" 검색은 신분당선 강남·강남대·강남구청까지 준다. 앞에서부터
 * 하나씩 집으면 출발지는 신분당선, 도착지는 대구 2호선이 잡히는 식이라
 * 노선 접두어가 어긋나 아무것도 못 찾는다.
 */
function samePair(
  a: SubwayStationRow[],
  b: SubwayStationRow[],
): { dep: string; arr: string } | null {
  for (const x of a) {
    const xi = x.subwayStationId ? splitId(x.subwayStationId) : null
    if (!xi) continue
    for (const y of b) {
      const yi = y.subwayStationId ? splitId(y.subwayStationId) : null
      if (!yi || yi.prefix !== xi.prefix || yi.order === xi.order) continue
      return { dep: x.subwayStationId!, arr: y.subwayStationId! }
    }
  }
  return null
}

/**
 * 그날 쓸 시각표 코드. 평일 01 / 토요일 02 / 일요일·공휴일 03.
 *
 * **토요일은 후보가 둘이다.** 노선마다 시각표를 몇 벌로 나누는지가 다르다 —
 * 서울 1~9호선처럼 평일·토요일·휴일 세 벌인 곳도 있고, 공항철도처럼
 * 평일·휴일 두 벌인 곳도 있다. 후자는 토요일에 휴일 시각표로 운행하므로
 * 02 를 물으면 0편이 온다. 그때 03 을 쓰는 건 추정이 아니라 그 노선이
 * 실제로 그날 굴리는 시각표를 쓰는 것이다.
 *
 * 순서대로 물어보고 먼저 걸리는 것을 쓴다.
 */
export function dailyTypeCodes(d: Date): string[] {
  const day = d.getDay()
  if (day === 0) return ['03']
  if (day === 6) return ['02', '03']
  return ['01']
}

export const hhmmss = (v: string | undefined, base: Date): Date | null => {
  const s = String(v ?? '')
  if (s.length < 4) return null
  const h = Number(s.slice(0, 2))
  const m = Number(s.slice(2, 4))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(base)
  // 25시, 26시처럼 넘어가는 표기를 그대로 더한다
  d.setHours(0, 0, 0, 0)
  d.setMinutes(h * 60 + m)
  return d
}

/**
 * 지하철 출발 시각.
 *
 * 방향을 확신할 수 없으면 **null 을 준다.** 상·하행을 잘못 고르면
 * 반대편 열차 시각을 사실인 양 보여주게 되는데, 그건 시각표가 없는 것보다 나쁘다.
 */
export async function subwayDeparturesBetween(
  fromName: string,
  toName: string,
  from: Date,
  durationMin: number,
  days = 2,
): Promise<Run[] | null> {
  const [depCands, arrCands] = await Promise.all([
    subwayCandidates(fromName),
    subwayCandidates(toName),
  ])
  const pair = samePair(depCands, arrCands)
  if (!pair) return null

  const a = splitId(pair.dep)!
  const b = splitId(pair.arr)!
  const towardHigher = b.order > a.order

  const runs: Run[] = []
  for (let i = 0; i < days; i++) {
    const day = new Date(from)
    day.setDate(day.getDate() + i)

    let matched: { rows: SubwaySchedRow[] } | null = null
    // 토요일은 02 를 먼저 보고, 그 노선에 토요일 시각표가 따로 없으면 03 으로 간다
    outer: for (const code of dailyTypeCodes(day)) {
      for (const ud of ['U', 'D']) {
        const rows =
          (await tagoCall<SubwaySchedRow>(TAGO.subway, 'GetSubwaySttnAcctoSchdulList', {
            subwayStationId: pair.dep,
            dailyTypeCode: code,
            upDownTypeCode: ud,
            numOfRows: '400',
          })) ?? []
        const end = rows[0]?.endSubwayStationId ? splitId(rows[0].endSubwayStationId) : null
        if (!end || end.prefix !== a.prefix) continue
        // 종점이 목적지와 같은 쪽에 있어야 그 방향 열차가 목적지를 지난다
        if (end.order > a.order === towardHigher) {
          matched = { rows }
          break outer
        }
      }
    }
    /*
     * 그날 데이터가 없으면 그날만 건너뛴다. 토요일 시각표가 비어 있는
     * 노선이 있어서, 여기서 통째로 포기하면 평일 것까지 날아간다.
     *
     * 다만 **기준일(i=0, 대개 오늘)이 통째로 비면 시각표 자체를 주지 않는다.**
     * 남는 건 내일 것뿐인데, 그걸 넘기면 엔진이 "오늘 탈 수 있는 편이 없다" 로
     * 읽고 출발을 내일 새벽으로 밀어버린다 — 토요일 오후에 검색했는데
     * "내일 05:06 에 나가세요" 가 나오는 식이다. 시각표가 없으면 없다고 하고
     * 소요시간만으로 추정하는 편이 정직하고 쓸모도 있다.
     */
    if (!matched) {
      if (i === 0) return null
      continue
    }

    for (const row of matched.rows) {
      const departAt = hhmmss(row.depTime, day)
      if (!departAt) continue
      runs.push({
        departAt: departAt.toISOString(),
        // 역별 시각표라 목적지 도착 시각은 없다. ODsay 의 소요시간을 쓴다.
        arriveAt: new Date(departAt.getTime() + durationMin * 60_000).toISOString(),
        carrier: row.endSubwayStationNm ? `${row.endSubwayStationNm} 방면` : '지하철',
      })
    }
  }

  if (runs.length === 0) return null
  runs.sort((a2, b2) => a2.departAt.localeCompare(b2.departAt))
  return runs
}
