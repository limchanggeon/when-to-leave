import { readFileSync } from 'node:fs'

/**
 * TAGO 터미널의 좌표표. `pnpm terminals:build` 가 만들고 사람이 검수한다.
 *
 * TAGO 는 터미널 목록에 좌표를 주지 않고 이름만 준다. 그래서 지금까지는
 * 카카오가 부르는 이름과 글자로 맞춰 왔는데, 부르는 법이 제각각이라
 * 규칙이 끝없이 늘었다("청주국제공항 시외버스정류장" ↔ "청주공항").
 * 좌표를 알면 이름을 볼 일이 없다 — 가까운 것을 고르면 된다.
 *
 * **이 표는 더하기만 한다.** 여기 없는 터미널은 예전처럼 이름으로 맞추므로,
 * 표가 비어 있어도 오늘 되는 것은 그대로 된다. 지오코딩이 엉뚱한 곳을
 * 짚었을 때 조용히 틀린 답을 내놓지 않게 하려는 것이다 —
 * 못 믿을 항목은 빌더가 terminalCoords.review.json 으로 빼둔다.
 */
export interface TerminalCoord {
  id: string
  name: string
  city?: string
  lat: number
  lng: number
  matched: string
  region?: string
}

type Table = Record<'suburbsBus' | 'expressBus', TerminalCoord[]>

const table: Table = JSON.parse(
  readFileSync(new URL('./terminalCoords.json', import.meta.url), 'utf8'),
) as Table

/** 두 점 사이 거리(m). 하버사인. */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface NearTerminal {
  /** TAGO 이름 — 시각표 조회용 */
  name: string
  /** 카카오가 아는 이름 — 화면 표시용 */
  label: string
  lat: number
  lng: number
  distanceM: number
}

/**
 * 이 점에서 가까운 TAGO 터미널.
 *
 * 반경을 둔다. 없으면 서울에서 물어도 강원도 터미널이 후보로 올라오는데,
 * 거기까지 가느니 기차를 타는 편이 낫다. 20km 는 카카오 장소 검색에
 * 쓰는 반경과 같게 맞췄다.
 */
export function terminalsNear(
  kind: 'suburbsBus' | 'expressBus',
  point: { lat: number; lng: number },
  limit: number,
  radiusM = 20000,
): NearTerminal[] {
  return table[kind]
    .map((t) => ({
      name: t.name,
      label: t.matched || t.name,
      lat: t.lat,
      lng: t.lng,
      distanceM: distanceM(point, t),
    }))
    .filter((t) => t.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit)
}

/** 표에 몇 곳이 들어 있는지. 서버가 뜰 때 한 줄 찍는다. */
export const terminalCount = {
  suburbsBus: table.suburbsBus.length,
  expressBus: table.expressBus.length,
}
