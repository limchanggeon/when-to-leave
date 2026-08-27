import { locate, permissionState } from './locate'
import { reverseGeocodeKakao } from './reverseKakao'
import type { GeoResult, ResolvedPlace } from './types'

export * from './types'
export { locate, permissionState }

/**
 * 현재 위치를 "이름 + 좌표"로 만든다.
 *
 * 지명 변환에 실패해도 좌표는 살아 있으므로 실패로 치지 않는다 —
 * 경로 계산에는 좌표만 있으면 되고, 이름은 화면 표시용이다.
 */
export async function currentPlace(fallbackName: string): Promise<GeoResult<ResolvedPlace>> {
  const located = await locate()
  if (!located.ok) return located

  const named = await reverseGeocodeKakao(located.data)
  return {
    ok: true,
    data: {
      name: named.ok ? named.data : fallbackName,
      coords: located.data,
    },
  }
}
