/**
 * TAGO 터미널 이름 → 좌표표를 만든다. 손으로 한 번 돌리고 결과를 커밋한다.
 *
 * 왜 필요한가: TAGO 는 터미널 목록에 좌표를 주지 않고 이름만 준다. 그래서
 * 지금까지는 카카오가 부르는 이름과 TAGO 가 부르는 이름을 글자로 맞춰
 * 왔는데, 부르는 법이 제각각이라 규칙이 끝없이 늘었다.
 *   카카오 "청주국제공항 시외버스정류장"  TAGO "청주공항"
 *   카카오 "대전복합터미널 서관"          TAGO "대전복합"
 * 한 번 좌표를 알아내 두면 이름을 볼 일이 없어진다 — 가까운 곳을 고르면 된다.
 *
 * 짧은 이름("청주", "대전복합")은 그냥 검색하면 시청이나 동 이름이 잡힌다.
 * 그래서 (1) 시외 목록이 주는 cityName 을 앞에 붙이고 (2) 카카오 분류가
 * 고속·시외 정류장인 것만 받는다. 그래도 못 믿을 것은 confidence 를 낮게 적어
 * 사람이 눈으로 볼 수 있게 남긴다 — 조용히 틀린 좌표가 제일 나쁘다.
 *
 *   pnpm terminals:build
 */
import './timezone'
import { writeFileSync } from 'node:fs'
import { serverEnv } from './env'
import { TAGO, tagoCall } from './tago'
import { INTERCITY_STOP } from './intercity'

interface Row {
  terminalId?: string
  terminalNm?: string
  cityName?: string
}

export interface TerminalCoord {
  id: string
  name: string
  city?: string
  lat: number
  lng: number
  /** 카카오에서 실제로 고른 장소 이름. 검수할 때 이걸 본다. */
  matched: string
  /** 카카오가 준 시·도. 검수할 때 본다. */
  region?: string
  /**
   * high  — 분류가 고속·시외 정류장이고 이름도 겹친다
   * low   — 분류는 맞는데 이름이 안 겹친다. 사람이 봐야 한다
   * 없음  — 아예 못 찾았다. 표에 넣지 않는다
   */
  confidence: 'high' | 'low'
}

const KEYWORD = 'https://dapi.kakao.com/v2/local/search/keyword.json'

async function search(query: string): Promise<any[]> {
  const u = new URL(KEYWORD)
  u.searchParams.set('query', query)
  u.searchParams.set('size', '15')
  const res = await fetch(u, { headers: { Authorization: `KakaoAK ${serverEnv.kakaoRestKey}` } })
  if (!res.ok) return []
  return ((await res.json()) as { documents?: any[] }).documents ?? []
}

/** 이름이 얼마나 겹치는가. 두 글자씩 잘라 비교한다 — 한국어 지명에 잘 맞는다. */
function overlap(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/[\s·().]/g, '')
    return new Set(Array.from({ length: Math.max(1, t.length - 1) }, (_, i) => t.slice(i, i + 2)))
  }
  const x = grams(a)
  const y = grams(b)
  if (x.size === 0) return 0
  let hit = 0
  for (const g of x) if (y.has(g)) hit++
  return hit / x.size
}

/** 카카오 주소에서 시·도만 뽑는다. "충청북도 청주시 …" → "충청북도" */
const regionOf = (doc: any): string =>
  String(doc.address_name ?? doc.road_address_name ?? '').split(' ')[0] ?? ''

/*
 * 시·도 이름을 한 표기로 모은다.
 *
 * TAGO 는 "충청북도", 카카오는 "충북" 이라 적는다. 이걸 안 맞추면 멀쩡한
 * 좌표가 지역 불일치로 버려진다 — 처음 돌렸을 때 시외 303곳이 91곳이 됐다.
 */
const REGION: Record<string, string> = {
  서울: '서울', 부산: '부산', 대구: '대구', 인천: '인천', 광주: '광주',
  대전: '대전', 울산: '울산', 세종: '세종', 경기: '경기', 강원: '강원',
  충청북: '충북', 충북: '충북', 충청남: '충남', 충남: '충남',
  전라북: '전북', 전북: '전북', 전라남: '전남', 전남: '전남',
  경상북: '경북', 경북: '경북', 경상남: '경남', 경남: '경남', 제주: '제주',
}

const canonRegion = (s: string): string => {
  const bare = s.replace(/특별자치도|특별자치시|광역시|특별시|자치도|[도시]$/g, '')
  return REGION[bare] ?? REGION[bare.slice(0, 2)] ?? bare
}

const sameRegion = (a: string, b: string): boolean =>
  Boolean(a && b) && canonRegion(a) === canonRegion(b)

const strip = (s: string) => s.replace(/\(.*?\)/g, '').replace(/[\s·().]/g, '')

async function locate(
  name: string,
  city: string | undefined,
  kind: string,
): Promise<TerminalCoord | null> {
  const clean = name.replace(/\(.*?\)/g, '').trim()
  const queries = [
    city ? `${city} ${clean} ${kind}` : null,
    `${clean} ${kind}`,
    city ? `${city} ${clean}터미널` : null,
    `${clean}터미널`,
  ].filter(Boolean) as string[]

  for (const q of queries) {
    const docs = await search(q)
    const ok = docs.filter((d) => INTERCITY_STOP.test(d.category_name ?? ''))
    if (!ok.length) continue
    const best = ok
      .map((d) => ({ d, score: overlap(clean, d.place_name ?? '') }))
      .sort((a, b) => b.score - a.score)[0]
    const lat = Number(best.d.y)
    const lng = Number(best.d.x)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    /*
     * 검증. 조용히 틀린 좌표가 제일 나쁘므로, 못 믿을 것은 아예 버린다 —
     * 표에 없으면 예전대로 이름으로 맞추므로 나빠지지 않는다.
     *
     * 시외 목록은 cityName 을 주므로 시·도가 맞는지 본다. "상봉"(서울)을
     * 진주시외버스터미널로 잡는 것 같은 사고가 여기서 걸린다.
     *
     * 고속 목록은 시·도가 없다. 그래서 이름이 서로를 품는지 요구한다 —
     * 느슨하게 두면 "김포"가 고양종합터미널이 된다.
     */
    const a = strip(name)
    const b = strip(best.d.place_name ?? '')
    const contains = a.length >= 2 && (b.includes(a) || a.includes(b))
    const region = regionOf(best.d)
    const verified = city ? sameRegion(city, region) : contains

    return {
      id: '',
      name,
      city,
      lat,
      lng,
      matched: best.d.place_name,
      region,
      confidence: verified && (contains || best.score >= 0.5) ? 'high' : 'low',
    }
  }
  return null
}

async function build(service: string, op: string, kind: string, label: string) {
  const rows = (await tagoCall<Row>(service, op, { numOfRows: '5000' })) ?? []
  const out: TerminalCoord[] = []
  const missed: string[] = []
  let done = 0
  for (const r of rows) {
    const id = r.terminalId?.trim()
    const name = r.terminalNm?.trim()
    if (!id || !name) continue
    const hit = await locate(name, r.cityName?.trim(), kind)
    if (hit) out.push({ ...hit, id })
    else missed.push(name)
    if (++done % 50 === 0) process.stdout.write(`  ${label} ${done}/${rows.length}\n`)
  }
  const low = out.filter((x) => x.confidence === 'low')
  console.log(`\n${label}: ${rows.length}곳 중 ${out.length}곳 찾음`)
  console.log(`  못 찾음 ${missed.length}곳: ${missed.slice(0, 12).join(', ')}${missed.length > 12 ? ' …' : ''}`)
  console.log(`  이름이 안 겹쳐 검수 필요 ${low.length}곳:`)
  for (const x of low.slice(0, 20)) console.log(`     "${x.name}" → "${x.matched}"`)
  return out
}

const suburbs = await build(TAGO.suburbsBus, 'GetSuberbsBusTrminlList', '시외버스터미널', '시외')
const express = await build(TAGO.expBus, 'GetExpBusTrminlList', '고속버스터미널', '고속')

/* 믿을 수 있는 것만 남긴다. 나머지는 표에 없으니 예전대로 이름으로 맞춘다. */
const keep = (rows: TerminalCoord[]) => rows.filter((r) => r.confidence === 'high')
const s2 = keep(suburbs)
const e2 = keep(express)

writeFileSync(
  new URL('./terminalCoords.json', import.meta.url),
  JSON.stringify({ suburbsBus: s2, expressBus: e2 }, null, 1) + '\n',
)
writeFileSync(
  new URL('./terminalCoords.review.json', import.meta.url),
  JSON.stringify(
    { suburbsBus: suburbs.filter((r) => r.confidence === 'low'), expressBus: express.filter((r) => r.confidence === 'low') },
    null,
    1,
  ) + '\n',
)
console.log(`\n저장: server/terminalCoords.json (시외 ${s2.length} · 고속 ${e2.length})`)
console.log(`검수용: server/terminalCoords.review.json (버린 것 ${suburbs.length - s2.length + express.length - e2.length}곳)`)
