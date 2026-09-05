import { describe, expect, it } from 'vitest'
import { encodePolyline } from '../../server/polyline'
import { decodePolyline } from './polyline'

/** 구글이 공개한 시험 벡터. 우리 구현이 표준을 따르는지 이걸로 못 박는다. */
const GOOGLE_VECTOR = {
  points: [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ],
  encoded: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
}

describe('폴리라인', () => {
  it('구글 시험 벡터와 같은 문자열을 만든다', () => {
    expect(encodePolyline(GOOGLE_VECTOR.points)).toBe(GOOGLE_VECTOR.encoded)
  })

  it('구글 시험 벡터를 되편다', () => {
    expect(decodePolyline(GOOGLE_VECTOR.encoded)).toEqual(GOOGLE_VECTOR.points)
  })

  it('왕복해도 1.1m 안쪽이다 — 정밀도 5자리', () => {
    const path = Array.from({ length: 500 }, (_, i) => ({
      lat: 36.3315 + Math.sin(i / 7) * 0.03,
      lng: 127.4344 + Math.cos(i / 11) * 0.05,
    }))
    const back = decodePolyline(encodePolyline(path))
    expect(back).toHaveLength(path.length)
    for (const [i, p] of path.entries()) {
      expect(Math.abs(back[i].lat - p.lat)).toBeLessThan(1e-5)
      expect(Math.abs(back[i].lng - p.lng)).toBeLessThan(1e-5)
    }
  })

  it('빈 좌표열은 빈 문자열이 되고 그 반대도 같다', () => {
    expect(encodePolyline([])).toBe('')
    expect(decodePolyline('')).toEqual([])
  })

  it('점 하나도 왕복한다', () => {
    const one = [{ lat: 36.33228, lng: 127.43465 }]
    expect(decodePolyline(encodePolyline(one))).toEqual(one)
  })

  /*
   * 잘린 문자열은 던지지 않는다. 지도의 선 하나 때문에 화면이 죽는 것보다
   * 선이 짧게 그려지는 편이 낫다.
   */
  it('잘린 문자열이 와도 읽은 데까지 돌려준다', () => {
    const full = encodePolyline(GOOGLE_VECTOR.points)
    for (let cut = 1; cut < full.length; cut++) {
      expect(() => decodePolyline(full.slice(0, cut))).not.toThrow()
    }
  })

  it('접으면 확 작아진다 — 이걸 하려고 만든 것이다', () => {
    const path = Array.from({ length: 1000 }, (_, i) => ({
      lat: 36.3315 + i * 0.0001,
      lng: 127.4344 + i * 0.0001,
    }))
    const asJson = JSON.stringify(path).length
    const asPolyline = JSON.stringify(encodePolyline(path)).length
    expect(asPolyline).toBeLessThan(asJson / 5)
  })
})
