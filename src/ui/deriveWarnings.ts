import type { Leg, Warning } from '../engine/types'

/**
 * 여정 전체에 걸리는 경고만 뽑는다.
 * 좌석처럼 특정 구간에 붙는 정보는 여기 넣지 않는다 — 스파인의 그 줄에
 * 이미 칩으로 붙어 있어서, 배너에 또 띄우면 같은 말을 두 번 하게 된다.
 */
export function deriveWarnings(legs: Leg[], now: Date, departAt: Date): Warning[] {
  const warnings: Warning[] = []

  if (departAt.getTime() < now.getTime()) {
    warnings.push({ code: 'already-late' })
  }

  // 매진은 여정 자체를 다시 짜야 하는 문제라 전체 경고로 올린다.
  if (legs.some((l) => l.discrete && l.seat?.available === false)) {
    warnings.push({ code: 'seat-sold-out' })
  }

  if (legs.some((l) => l.confidence === 'scheduled')) {
    warnings.push({ code: 'scheduled-only' })
  }

  return warnings
}
