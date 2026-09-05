/**
 * 좌표가 맞는지 **시각표로** 따진다. 사람이 검수하지 않아도 되게.
 *
 * 지오코딩은 짧은 이름에서 엉뚱한 곳을 짚는다 — "상봉"(서울)이 진주로,
 * "김포"가 고양으로 갔다. 그런데 그런 오류는 스스로를 드러낸다:
 * 상봉에서 동서울까지 버스가 30분이라는데 좌표대로면 300km 떨어져 있으니,
 * 그 버스는 시속 600km 로 달린 셈이 된다. 버스는 그렇게 못 간다.
 *
 * 그래서 닻이 되는 큰 터미널까지의 **소요 시간**과 좌표상 **직선 거리**를
 * 견줘 본다. 말이 되면 표에 넣고, 안 되면 버린다. 노선이 아예 없어
 * 따질 수 없는 곳은 판단을 미룬다 — 모르면 넣지 않는다.
 *
 *   pnpm terminals:verify
 */
import './timezone'
import { readFileSync, writeFileSync } from 'node:fs'
import { expressBusesBetween, suburbsBusesBetween } from './tagoSchedules'
import { distanceM, type TerminalCoord } from './terminalIndex'

type Kind = 'suburbsBus' | 'expressBus'
type Table = Record<Kind, TerminalCoord[]>

const read = (f: string): Table =>
  JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')) as Table

const table = read('./terminalCoords.json')
const review = read('./terminalCoords.review.json')

/** 좌표를 믿을 수 있는 큰 터미널들. 전국에 고루 흩어져 있어야 한다. */
const ANCHORS = [
  { name: '동서울', lat: 37.5348, lng: 127.0944 },
  { name: '대전복합', lat: 36.3503, lng: 127.4367 },
  { name: '부산', lat: 35.2853, lng: 129.0951 },
  { name: '대구서부', lat: 35.8369, lng: 128.5577 },
]

/*
 * 버스가 낼 수 있는 속도. 직선 거리로 재므로 실제 도로보다 짧게 나오고,
 * 그만큼 계산된 속도는 실제보다 **느리게** 나온다. 위쪽만 촘촘히 본다.
 */
const MAX_KMH = 110
const MIN_KMH = 25
/** 이보다 가까우면 비율이 흔들려 따지지 않는다. */
const MIN_DIST_KM = 15

type Verdict = { ok: boolean; why: string }

/**
 * 닻 **둘**이 동의해야 통과시킨다.
 *
 * 하나만 보면 우연에 속는다. "연무대"(논산)가 동수원으로 잘못 찍혔는데
 * 부산까지 거리가 논산이나 수원이나 비슷해서 그냥 통과했다. 방향이 다른
 * 닻을 하나 더 보면 그 우연이 겹치기 어렵다.
 *
 * 닻으로 가는 편이 하나뿐이면 판단을 미룬다 — 표에 안 넣으면 예전대로
 * 이름으로 맞추므로 나빠지지 않는다. 모르면 넣지 않는다.
 */
const MIN_AGREE = 2

async function judge(kind: Kind, t: TerminalCoord): Promise<Verdict | null> {
  const fn = kind === 'expressBus' ? expressBusesBetween : suburbsBusesBetween
  const now = new Date()
  const notes: string[] = []
  let agreed = 0
  let disagreed = 0

  for (const a of ANCHORS) {
    if (a.name === t.name) continue
    const km = distanceM({ lat: t.lat, lng: t.lng }, a) / 1000

    // 양방향으로 물어본다 — 한쪽만 편성이 있는 경우가 흔하다
    const runs = (await fn(t.name, a.name, now, 2)) ?? (await fn(a.name, t.name, now, 2))
    if (!runs?.length) continue

    const fastestMin = Math.min(
      ...runs.map((r) => (new Date(r.arriveAt).getTime() - new Date(r.departAt).getTime()) / 60000),
    )
    if (!Number.isFinite(fastestMin) || fastestMin <= 0) continue
    if (km < MIN_DIST_KM) continue // 너무 가까우면 비율이 흔들린다 — 세지 않는다

    const kmh = km / (fastestMin / 60)
    const ok = kmh <= MAX_KMH && kmh >= MIN_KMH
    notes.push(`${a.name} ${km.toFixed(0)}km/${fastestMin.toFixed(0)}분=${kmh.toFixed(0)}km/h`)
    if (ok) agreed++
    else disagreed++
  }

  if (disagreed > 0) return { ok: false, why: notes.join(', ') }
  if (agreed >= MIN_AGREE) return { ok: true, why: notes.join(', ') }
  return null // 따질 거리가 모자란다
}

const rescued: Table = { suburbsBus: [], expressBus: [] }
const rejected: Table = { suburbsBus: [], expressBus: [] }
const unknown: Table = { suburbsBus: [], expressBus: [] }

for (const kind of ['suburbsBus', 'expressBus'] as Kind[]) {
  console.log(`\n=== ${kind} 검수 대상 ${review[kind].length}곳 ===`)
  for (const t of review[kind]) {
    const v = await judge(kind, t)
    if (!v) {
      unknown[kind].push(t)
      continue
    }
    ;(v.ok ? rescued : rejected)[kind].push(t)
    console.log(`  ${v.ok ? '✓' : '✗'} "${t.name}" → "${t.matched}"  ${v.why}`)
  }
}

for (const kind of ['suburbsBus', 'expressBus'] as Kind[]) {
  table[kind] = [...table[kind], ...rescued[kind]]
  console.log(
    `\n${kind}: 되살림 ${rescued[kind].length} · 버림 ${rejected[kind].length} · 판단보류 ${unknown[kind].length} → 표 ${table[kind].length}곳`,
  )
}

writeFileSync(new URL('./terminalCoords.json', import.meta.url), JSON.stringify(table, null, 1) + '\n')
writeFileSync(
  new URL('./terminalCoords.review.json', import.meta.url),
  JSON.stringify(
    {
      suburbsBus: [...rejected.suburbsBus, ...unknown.suburbsBus],
      expressBus: [...rejected.expressBus, ...unknown.expressBus],
    },
    null,
    1,
  ) + '\n',
)
