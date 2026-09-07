import type { Leg, Mode } from './types'

export type SeatState = 'ok' | 'unknown' | 'sold-out'

/**
 * 여정 전체의 좌석 상태.
 *
 * null(조회 불가)과 false(매진)는 다르다 — 계획 시간표만 있는 편은 늘 null 인데,
 * 이걸 매진과 같이 취급하면 그 편이 영영 안 뽑힌다.
 *
 * 좌석 정보가 **아예 없으면 'ok' 가 아니라 'unknown'** 이다.
 * ODsay 처럼 좌석을 주지 않는 소스에서 'ok' 를 내면
 * 화면에 "좌석 있음"이라는 근거 없는 말이 뜬다.
 */
export function seatStateOf(legs: Leg[]): SeatState {
  let sawSeatInfo = false
  let sawUnknown = false
  for (const leg of legs) {
    if (!leg.seat) continue
    sawSeatInfo = true
    if (leg.seat.available === false) return 'sold-out'
    if (leg.seat.available === null) sawUnknown = true
  }
  if (!sawSeatInfo) return 'unknown'
  return sawUnknown ? 'unknown' : 'ok'
}

export interface Rankable {
  legs: Leg[]
  departAt: Date
  arriveAt: Date
}

/** 왜 이 경로가 뽑혔는지. 화면에 그대로 보여준다. */
export type ChosenReason = 'latest-departure' | 'earliest-arrival'

export const reasonFor = (mode: Mode): ChosenReason =>
  mode === 'arriveBy' ? 'latest-departure' : 'earliest-arrival'

const isSoldOut = (r: Rankable) => seatStateOf(r.legs) === 'sold-out'
const SEAT_TIEBREAK: Record<SeatState, number> = { ok: 0, unknown: 1, 'sold-out': 2 }

/**
 * 시외 수단. 기차·고속버스·시외버스(공항버스 포함)·항공.
 *
 * 지하철은 뺀다 — 시내 수단이다.
 */
const INTERCITY_KINDS = new Set(['train', 'expressBus', 'suburbsBus', 'flight'])

const usesIntercity = (legs: Leg[]) =>
  legs.some((l) => l.tagoKind !== undefined && INTERCITY_KINDS.has(l.tagoKind))

/**
 * 환승 한 번의 값. 분 단위.
 *
 * 갈아타는 일은 시간만 드는 게 아니다 — 짐을 들고 계단을 오르내리고, 놓칠까
 * 신경 쓰고, 한 번 어긋나면 뒤가 다 밀린다. 교통 계획에서 환승 한 번을
 * 차내 5~15분과 같게 치는 관행을 따르되, 이 앱은 공항처럼 짐을 든 장거리를
 * 자주 다루므로 위쪽을 쓴다.
 */
const TRANSFER_COST_MIN = 15

/** 걷는 1분의 값. 차에 앉아 가는 1분보다 힘들지만 환승만큼 위험하진 않다. */
const WALK_COST_PER_MIN = 0.5

/**
 * 시외 수단에 주는 가산점(분).
 *
 * 기차로 갈 길을 시내버스로 갈아타며 가라는 답은 틀린 답이다. 그래서 시외
 * 수단을 앞세우되, **무조건은 아니다.**
 *
 * 처음에는 순서로 못 박았다가 크게 물렸다. 대전 → 인천공항을 오후 4시 40분에
 * 물었더니 "내일 새벽 2시 40분에 나가세요" 가 나왔다 — 공항버스 막차가
 * 16:05 에 끊겨 다음 편이 다음날 첫차였는데, 오늘 21:37 에 닿는 길을 두고
 * 9시간 늦게 도착하는 쪽을 고른 것이다. 순서는 크기를 못 본다.
 *
 * 그래서 값으로 준다. 한 시간쯤 손해를 감수하고 시외 수단을 택하지만,
 * 반나절을 잃으면서까지 택하지는 않는다.
 */
const INTERCITY_BONUS_MIN = 60

/**
 * 이 여정이 요구하는 수고. 분으로 환산한다.
 *
 * 이게 없으면 순위가 환승과 도보를 **0원으로 친다.** 실제로 그래서
 * "35분 늦게 나가도 된다" 는 이유 하나로 환승 3회에 도보 39분짜리가,
 * 환승 1회에 도보 6분이고 1시간 50분 일찍 닿는 공항버스를 이겼다
 * (2026-09-05, 대전 → 인천공항).
 */
function effortMin(legs: Leg[]): number {
  const rides = legs.filter((l) => l.kind !== 'walk').length
  const walkMin = legs
    .filter((l) => l.kind === 'walk')
    .reduce((sum, l) => sum + (l.arriveAt.getTime() - l.departAt.getTime()) / 60_000, 0)
  return Math.max(0, rides - 1) * TRANSFER_COST_MIN + walkMin * WALK_COST_PER_MIN
}

/**
 * 이 경로를 고르는 값. 낮을수록 좋다. 분 단위.
 *
 * 수고에서 시외 가산점을 뺀다. 값 하나로 합치므로 비교가 여전히 하나의
 * 수직선 위에서 이뤄진다 — 정렬 비교자는 반드시 전순서여야 해서
 * "다른 게 다 나으면 봐준다" 같은 조건부 규칙을 쓸 수 없다.
 */
const costMin = (legs: Leg[]) =>
  effortMin(legs) - (usesIntercity(legs) ? INTERCITY_BONUS_MIN : 0)

/** 수고를 반영한 출발 시각. 늦을수록 좋다. */
const effectiveDeparture = (r: Rankable) => r.departAt.getTime() - costMin(r.legs) * 60_000

/** 수고를 반영한 도착 시각. 이를수록 좋다. */
const effectiveArrival = (r: Rankable) => r.arriveAt.getTime() + costMin(r.legs) * 60_000

/**
 * 경로 비교. 낮을수록 먼저 온다.
 *
 * 1. 매진은 뒤로 — 못 타는 편은 아무리 빨라도 소용없다.
 * 2. 목표 도착 모드면 **늦게 나가도 되는 쪽**이 낫다. 같은 시각에 도착한다면
 *    한 시간 더 자도 되는 경로가 이긴다.
 *    지금 출발 모드면 **빨리 도착하는 쪽**이 낫다.
 * 3. 그래도 같으면 좌석이 확인된 쪽.
 */
export function compareRoutes(a: Rankable, b: Rankable, mode: Mode): number {
  const soldA = isSoldOut(a)
  const soldB = isSoldOut(b)
  if (soldA !== soldB) return soldA ? 1 : -1

  if (mode === 'arriveBy') {
    // 늦게 나가도 되는 쪽이 좋다. 다만 환승·도보의 수고를 값으로 쳐서 뺀다.
    const byDeparture = effectiveDeparture(b) - effectiveDeparture(a)
    if (byDeparture !== 0) return byDeparture
    const byArrival = a.arriveAt.getTime() - b.arriveAt.getTime()
    if (byArrival !== 0) return byArrival
  } else {
    // 빨리 닿는 쪽이 좋다. 여기서도 환승·도보의 수고를 값으로 쳐서 더한다 —
    // 예전에는 도착 시각만 봐서, 1분 빨리 닿는 환승 3회짜리가 직행을 이겼다.
    const byArrival = effectiveArrival(a) - effectiveArrival(b)
    if (byArrival !== 0) return byArrival
    const byDeparture = b.departAt.getTime() - a.departAt.getTime()
    if (byDeparture !== 0) return byDeparture
  }

  return SEAT_TIEBREAK[seatStateOf(a.legs)] - SEAT_TIEBREAK[seatStateOf(b.legs)]
}

/**
 * 경로를 사람이 알아볼 이름으로. 이름표를 따로 두지 않고 데이터에서 뽑는다.
 *
 * 이산 구간만 보면 안 된다 — 시각표 없이 소요시간만 주는 소스(ODsay)에서는
 * 모든 구간이 연속 구간이라 이름이 하나도 안 잡힌다.
 * 가장 오래 타는 비(非)도보 구간을 대표로 쓴다.
 */
/**
 * 이 경로를 한 줄로 부르는 이름.
 *
 * 예전에는 **가장 오래 타는 구간 하나**만 보여줬다. 그래서 같은 버스로
 * 시작하는 서로 다른 길이 화면에 똑같이 나왔다 — 브라더냉동 → 목원대학교의
 * 두 경로가 둘 다 "603 · 목운주택입구" 로 보여, 무엇이 다른지 알 수 없었다.
 *
 * 이제 타는 것을 순서대로 다 적는다. "603 → 601" 과 "603" 은 한눈에 다르다.
 * 한 구간에 노선이 여럿이면(같은 길을 여러 번호가 다닌다) 첫 번호만 적고
 * 나머지는 접는다 — 줄이 길어지면 오히려 안 읽힌다.
 */
export function describeRoute(legs: Leg[]): { carrier: string | null; origin: string | null } {
  const rides = legs.filter((l) => l.kind !== 'walk')
  if (rides.length === 0) return { carrier: null, origin: null }

  const short = (c: string | undefined) => {
    if (!c) return null
    const [first, ...rest] = c.split(',').map((x) => x.trim()).filter(Boolean)
    return rest.length ? `${first} 외 ${rest.length}` : first
  }
  const names = rides.map((l) => short(l.carrier)).filter(Boolean)
  return {
    carrier: names.length ? names.join(' → ') : null,
    // 어디서 타는지는 첫 구간이 답이다 — 사람이 지금 가야 할 곳이다
    origin: rides[0].from.name ?? null,
  }
}

/* ---------------- 대안 고르기 ---------------- */

/** 갈아탄 횟수. 타는 구간이 n개면 환승은 n-1번이다. */
export const transferCount = (legs: Leg[]): number =>
  Math.max(0, legs.filter((l) => l.kind !== 'walk').length - 1)

/** 걷는 시간(분). */
export const walkMin = (legs: Leg[]): number =>
  legs
    .filter((l) => l.kind === 'walk')
    .reduce((sum, l) => sum + (l.arriveAt.getTime() - l.departAt.getTime()) / 60_000, 0)

/**
 * 이 경로가 실제로 어디를 지나는가. 두 경로가 같은 길인지 이걸로 가른다.
 *
 * **노선 번호는 넣지 않는다.** 같은 정류장 사이를 611번으로 가나 622번으로
 * 가나 같은 길이다. 번호까지 넣으면 그 둘이 서로 다른 "대안" 이 되어,
 * 고르라고 내놓은 목록이 사실은 한 경로의 변주로 가득 찬다.
 * 실제로 대전 → 인천공항에서 대안 셋이 전부 8366 → 5000,5005 였다.
 *
 * 걷는 구간은 뺀다. 어느 골목으로 걷느냐는 경로의 정체성이 아니다.
 */
export const routeKey = (legs: Leg[]): string =>
  legs
    .filter((l) => l.kind !== 'walk')
    .map((l) => `${l.kind}:${l.from.name}>${l.to.name}`)
    .join('|')

/**
 * 같은 길을 가는 노선 번호를 한 줄로 합친다.
 *
 * 카카오는 한 구간을 611번으로도 622번으로도 갈 수 있으면 두 경로로 준다.
 * 사람에게는 "611이나 622를 타세요" 가 맞는 말이지 서로 다른 선택지가 아니다.
 * 먼저 온 경로에 번호만 얹고 나머지는 버린다.
 */
function mergeCarriers(into: Leg[], from: Leg[]): Leg[] {
  return into.map((leg, i) => {
    const other = from[i]
    if (!other || leg.kind === 'walk' || !other.carrier || other.carrier === leg.carrier) return leg
    const seen = new Set((leg.carrier ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    for (const c of other.carrier.split(',').map((s) => s.trim())) if (c) seen.add(c)
    return { ...leg, carrier: [...seen].join(', ') }
  })
}

/**
 * 같은 길인 경로를 하나로 접는다. 순서는 그대로 두고 먼저 온 것을 남긴다.
 * 남는 쪽에 다른 쪽의 노선 번호를 얹는다.
 */
export function dedupeRoutes<T extends Rankable>(routes: T[]): T[] {
  const out: T[] = []
  const at = new Map<string, number>()
  for (const r of routes) {
    const key = routeKey(r.legs)
    const i = at.get(key)
    if (i === undefined) {
      at.set(key, out.length)
      out.push(r)
      continue
    }
    // 걷는 구간 수까지 같을 때만 번호를 합친다 — 모양이 다르면 못 겹친다
    if (out[i].legs.length === r.legs.length) {
      out[i] = { ...out[i], legs: mergeCarriers(out[i].legs, r.legs) }
    }
  }
  return out
}

/** 대안을 왜 보여주는가. 화면이 이 이름을 그대로 띄운다. */
export type AltAxis = 'fewest-transfers' | 'least-walking' | 'fastest'

/**
 * 축마다 가장 나은 것을 하나씩 고른다.
 *
 * 예전에는 같은 정렬에서 1등만 빼고 나머지를 그대로 보여줬다. 그러면
 * 비슷비슷한 것이 줄줄이 남아서, 고르라고 내놓았지만 고를 것이 없었다.
 * 대안은 **무엇이 다른지 말할 수 있을 때만** 대안이다.
 *
 * 고른 경로보다 그 축에서 실제로 나은 것만 남긴다. 환승이 똑같은데
 * "최소 환승" 이라고 붙여 내놓으면 거짓말이 된다.
 */
export function pickAlternatives<T extends Rankable>(
  chosen: T,
  pool: T[],
  mode: Mode,
): { axis: AltAxis; route: T }[] {
  const total = (r: T) => r.arriveAt.getTime() - r.departAt.getTime()
  const axes: { axis: AltAxis; score: (r: T) => number }[] = [
    { axis: 'fewest-transfers', score: (r) => transferCount(r.legs) },
    { axis: 'least-walking', score: (r) => walkMin(r.legs) },
    { axis: 'fastest', score: total },
  ]

  const picked: { axis: AltAxis; route: T }[] = []
  const taken = new Set([routeKey(chosen.legs)])

  for (const { axis, score } of axes) {
    const better = pool
      .filter((r) => !taken.has(routeKey(r.legs)) && score(r) < score(chosen))
      .sort((a, b) => score(a) - score(b) || compareRoutes(a, b, mode))[0]
    if (!better) continue
    taken.add(routeKey(better.legs))
    picked.push({ axis, route: better })
  }
  return picked
}
