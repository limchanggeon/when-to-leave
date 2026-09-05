import type { LatLng } from '../engine/types'

/**
 * 접힌 좌표열을 되편다 (구글 인코딩 폴리라인, 정밀도 5자리).
 *
 * 서버의 `server/polyline.ts` 가 접은 것을 여기서 편다. 두 파일은 서로를
 * import 하지 않는다 — 서버와 클라이언트가 코드를 나눠 쓰지 않는 구조라서다.
 * 대신 같은 표준을 구현하고, 왕복 시험이 둘이 맞물리는지 지킨다.
 *
 * 망가진 문자열이 와도 던지지 않고 **읽은 데까지만** 돌려준다. 지도의 선
 * 하나 때문에 화면 전체가 죽는 것보다, 선이 짧게 그려지는 편이 낫다.
 */
const FACTOR = 1e5

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = []
  let i = 0
  let lat = 0
  let lng = 0

  while (i < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      if (i >= encoded.length) return points // 중간에 끊겼다 — 읽은 데까지
      byte = encoded.charCodeAt(i++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      if (i >= encoded.length) return points
      byte = encoded.charCodeAt(i++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ lat: lat / FACTOR, lng: lng / FACTOR })
  }
  return points
}
