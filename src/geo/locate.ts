import type { Coords, GeoResult } from './types'

/**
 * 브라우저 위치. 반드시 사용자가 버튼을 눌렀을 때만 부른다 —
 * 페이지를 열자마자 권한 창을 띄우면 대부분 거부당하고,
 * 한 번 거부되면 다시 물어볼 수 없다.
 *
 * HTTPS 또는 localhost 에서만 동작한다.
 */
export function locate(timeoutMs = 10_000): Promise<GeoResult<Coords>> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, failure: { code: 'unsupported' } })
  }

  return new Promise((resolve) => {
    // getCurrentPosition 의 timeout 옵션이 안 먹는 브라우저가 있어 이중으로 건다
    let settled = false
    const finish = (r: GeoResult<Coords>) => {
      if (settled) return
      settled = true
      clearTimeout(guard)
      resolve(r)
    }
    const guard = setTimeout(() => finish({ ok: false, failure: { code: 'timeout' } }), timeoutMs + 2000)

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish({
          ok: true,
          data: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          },
        }),
      (err) => {
        const code =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable'
        finish({ ok: false, failure: { code } })
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}
