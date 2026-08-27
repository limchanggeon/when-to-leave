import { config } from '../config'
import { loadScript } from '../auth/types'
import type { Coords, GeoResult } from './types'

const SDK = (key: string) =>
  `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`

type Status = 'OK' | 'ZERO_RESULT' | 'ERROR'
type Kakao = {
  maps: {
    load(cb: () => void): void
    services: {
      Status: Record<string, Status>
      Geocoder: new () => {
        coord2Address(
          lng: number,
          lat: number,
          cb: (
            result: { road_address?: { building_name?: string; address_name?: string }; address?: { address_name?: string } }[],
            status: Status,
          ) => void,
        ): void
      }
    }
  }
}

/**
 * 좌표 → 지명. 카카오 Local(services) 라이브러리를 쓴다.
 *
 * 주의 1: coord2Address 의 인자 순서는 (경도, 위도)다. 흔히 뒤집어 쓰는 자리라
 *         잘못 넣으면 엉뚱한 나라가 나온다.
 * 주의 2: 이 SDK 는 조회가 실패해도 콜백을 부르지 않는 경우가 있다.
 *         타임아웃을 걸지 않으면 화면이 "위치 확인 중…"에 영영 갇힌다.
 */
const REVERSE_TIMEOUT_MS = 6000

export async function reverseGeocodeKakao(coords: Coords): Promise<GeoResult<string>> {
  const key = config.kakao.jsKey
  if (!key) return { ok: false, failure: { code: 'no-address', detail: 'VITE_KAKAO_JS_KEY 없음' } }

  try {
    await loadScript(SDK(key))
  } catch {
    return { ok: false, failure: { code: 'no-address', detail: '카카오 SDK 로드 실패' } }
  }

  const kakao = (window as unknown as { kakao?: Kakao }).kakao
  if (!kakao?.maps) return { ok: false, failure: { code: 'no-address', detail: 'SDK 없음' } }

  return new Promise((resolve) => {
    let settled = false
    const finish = (r: GeoResult<string>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(
      () => finish({ ok: false, failure: { code: 'no-address', detail: '주소 조회 시간 초과' } }),
      REVERSE_TIMEOUT_MS,
    )

    kakao.maps.load(() => {
      try {
        new kakao.maps.services.Geocoder().coord2Address(coords.lng, coords.lat, (result, status) => {
          if (status !== kakao.maps.services.Status.OK || result.length === 0) {
            finish({ ok: false, failure: { code: 'no-address' } })
            return
          }
          const first = result[0]
          // 건물명이 있으면 가장 알아보기 쉽다
          const name =
            first.road_address?.building_name ||
            first.road_address?.address_name ||
            first.address?.address_name
          finish(name ? { ok: true, data: name } : { ok: false, failure: { code: 'no-address' } })
        })
      } catch (e) {
        finish({ ok: false, failure: { code: 'no-address', detail: String(e) } })
      }
    })
  })
}
