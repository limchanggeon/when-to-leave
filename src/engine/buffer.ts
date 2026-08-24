import type { LegKind, LegSpec } from './types'

/**
 * "몇 분 전에 도착해야 하는가". 코드에 흩뿌리지 않고 여기 한 곳에서만 읽는다.
 * 국제선은 의도적으로 넣지 않았다 — 공항 어댑터가 혼잡도로 계산해
 * LegSpec.bufferMin 으로 직접 넘겨야 한다.
 */
export interface BufferPolicy {
  base: Record<LegKind, number>
  /** 개인 보정 계수. 매번 늦는 사람은 1.2 쯤. 실측으로 학습한다. */
  personalFactor: number
}

export const DEFAULT_POLICY: BufferPolicy = {
  base: {
    walk: 0,
    taxi: 0,
    subway: 0, // 수시 운행 — 놓쳐도 배차 간격만큼만 손해
    bus: 15, // 고속·시외버스 기준. 시내버스는 어댑터가 0으로 덮는다
    train: 9, // 고속철도: 대합실 → 승강장
    flight: 50, // 국내선. 국제선은 어댑터가 bufferMin 으로 덮어야 한다
  },
  personalFactor: 1.0,
}

export function resolveBuffer(spec: LegSpec, policy: BufferPolicy): number {
  const base = spec.bufferMin ?? policy.base[spec.kind]
  return Math.round(base * policy.personalFactor)
}
