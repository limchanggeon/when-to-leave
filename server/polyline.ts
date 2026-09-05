/**
 * 좌표열을 짧은 문자열로 접는다 (구글 인코딩 폴리라인, 정밀도 5자리).
 *
 * 경로 응답의 86% 가 이 좌표들이었다 — 6820개 점이 285KB. 한 점이
 * `{"lat":36.33228389,"lng":127.4346499}` 로 43바이트나 되기 때문이다.
 * 접으면 점당 5바이트 안팎, 285KB 가 33KB 가 된다.
 *
 * 이웃한 점끼리의 **차이**만 담는 게 핵심이다. 길을 따라가는 좌표는 조금씩만
 * 변하므로 차이는 늘 작은 수가 되고, 작은 수는 짧게 적힌다.
 *
 * 정밀도 5자리는 약 1.1m 다. 지도에 선을 긋는 데 그보다 촘촘할 이유가 없다.
 *
 * 서버와 클라이언트가 같은 파일을 쓰지 않는 구조라 짝이 되는 decode 는
 * `src/map/polyline.ts` 에 있다. 둘은 같은 표준을 구현하므로 서로를 몰라도
 * 맞물린다 — 시험이 그 사실을 지킨다.
 */
export interface LatLng {
  lat: number
  lng: number
}

const FACTOR = 1e5

/** 한 축의 차이값을 5비트씩 끊어 담는다. */
function chunk(value: number, out: string[]): void {
  // 음수를 부호비트가 앞에 오도록 옮긴다. 그래야 작은 음수도 짧아진다.
  let v = value < 0 ? ~(value << 1) : value << 1
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63))
    v >>>= 5
  }
  out.push(String.fromCharCode(v + 63))
}

export function encodePolyline(points: LatLng[]): string {
  const out: string[] = []
  let prevLat = 0
  let prevLng = 0
  for (const p of points) {
    // 반올림을 먼저 하고 차이를 낸다. 차이를 먼저 내면 오차가 쌓인다.
    const lat = Math.round(p.lat * FACTOR)
    const lng = Math.round(p.lng * FACTOR)
    chunk(lat - prevLat, out)
    chunk(lng - prevLng, out)
    prevLat = lat
    prevLng = lng
  }
  return out.join('')
}
