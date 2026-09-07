/**
 * 등급과 하루 조회 한도.
 *
 * 숫자를 여기 한곳에 둔다. DB 행마다 박아두면 정책을 바꿀 때 모든 행을
 * 고쳐야 하고, 사람마다 다른 숫자가 조용히 생긴다.
 *
 * 로그인하지 않은 사람은 여기 없다 — 그쪽은 브라우저에서 한 번만 세고,
 * 서버는 세지 않는다(방문자를 알아볼 것을 저장하지 않기로 해서다).
 */
export type Tier = 'free' | 'supporter' | 'unlimited'

interface TierSpec {
  /** 하루 몇 번까지. null 이면 제한 없음. */
  perDay: number | null
  label: string
}

export const TIERS: Record<Tier, TierSpec> = {
  free: { perDay: 3, label: '무료' },
  supporter: { perDay: 50, label: '후원자' },
  unlimited: { perDay: null, label: '무제한' },
}

export const isTier = (v: string): v is Tier => v in TIERS

/** 모르는 값이 들어 있어도 무료로 친다 — 열어주는 쪽으로 틀리지 않는다. */
export const tierOf = (v: string | null | undefined): Tier =>
  v && isTier(v) ? v : 'free'

export const limitFor = (t: Tier): number | null => TIERS[t].perDay
