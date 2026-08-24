import type { Leg, Warning } from '../engine/types'

/** 확정된 여정에서 사용자에게 보여줘야 할 경고를 뽑는다. */
export function deriveWarnings(legs: Leg[], now: Date, departAt: Date): Warning[] {
  const warnings: Warning[] = []

  if (departAt.getTime() < now.getTime()) {
    warnings.push({ code: 'already-late' })
  }

  for (const leg of legs) {
    if (!leg.discrete || !leg.seat) continue
    if (leg.seat.available === null) warnings.push({ code: 'seat-unknown', params: { kind: leg.kind } })
    if (leg.seat.available === false) warnings.push({ code: 'seat-sold-out', params: { kind: leg.kind } })
  }

  if (legs.some((l) => l.confidence === 'scheduled')) {
    warnings.push({ code: 'scheduled-only' })
  }

  return warnings
}
