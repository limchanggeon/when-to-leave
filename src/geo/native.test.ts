import { beforeEach, describe, expect, it, vi } from 'vitest'
const geo = vi.hoisted(() => ({ checkPermissions: vi.fn(), requestPermissions: vi.fn(), getCurrentPosition: vi.fn() }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: geo }))
import { locateNative, nativePermissionState } from './native'
beforeEach(() => {
  vi.resetAllMocks()
  geo.getCurrentPosition.mockResolvedValue({ coords: { latitude: 37.5, longitude: 127, accuracy: 20 } })
})
describe('Android GPS', () => {
  it('대략적 위치만 허용해도 사용할 수 있다', async () => {
    geo.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'granted' })
    expect(await nativePermissionState()).toBe('granted')
    expect((await locateNative()).ok).toBe(true)
    expect(geo.requestPermissions).not.toHaveBeenCalled()
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({ enableHighAccuracy: false }))
  })
  it('검색과 지도의 동시 요청은 권한 요청 한 번으로 합친다', async () => {
    geo.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' })
    geo.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
    const [a,b] = await Promise.all([locateNative(), locateNative()])
    expect(a).toEqual(b)
    expect(a.ok).toBe(true)
    expect(geo.requestPermissions).toHaveBeenCalledTimes(1)
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
  })
  it('권한 거부를 위치로 처리하지 않는다', async () => {
    geo.checkPermissions.mockResolvedValue({ location: 'prompt' })
    geo.requestPermissions.mockResolvedValue({ location: 'denied' })
    expect(await locateNative()).toEqual({ ok: false, failure: { code: 'denied' } })
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
  })
  it('GPS가 꺼져 있으면 오류 값으로 반환한다', async () => {
    geo.checkPermissions.mockRejectedValue({ code: 'OS-PLUG-GLOC-0007' })
    expect(await locateNative()).toEqual({ ok: false, failure: { code: 'unavailable' } })
  })
})
