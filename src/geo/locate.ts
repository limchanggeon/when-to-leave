import type { Coords, GeoResult } from './types'

/**
 * 브라우저가 기억하고 있는 위치 권한 상태.
 * 'denied' 면 getCurrentPosition 을 불러도 창이 뜨지 않고 즉시 거부된다 —
 * "동의 창이 안 뜬다"는 증상의 대부분이 이것이다.
 * Permissions API 가 없는 브라우저에서는 'unknown'.
 */
export async function permissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

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

  // 안전하지 않은 출처에서는 권한 창이 뜨지 않고 그냥 막힌다.
  // 먼저 걸러야 "아무 일도 안 일어나는" 상태를 피할 수 있다.
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return Promise.resolve({ ok: false, failure: { code: 'insecure-context' } })
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
