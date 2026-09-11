import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ platform: vi.fn(), schedule: vi.fn() }))
vi.mock('../native/platform', () => ({ platform: mock.platform }))
/*
 * 진짜 카파시터처럼 **Proxy** 로 흉내 낸다.
 *
 * 예전에는 평범한 객체를 돌려줬는데, 그러면 `then` 이 없어서 async 함수가
 * 이 객체를 그대로 return 해도 아무 일이 없다. 실제 플러그인은 어떤 속성을
 * 물어도 메서드로 받아주기 때문에 `.then` 까지 호출돼 터진다 —
 * 시험은 초록인데 앱에서는 알람 단추가 죽어 있었다.
 */
vi.mock('@capacitor/core', () => ({
  registerPlugin: () =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'schedule') return mock.schedule
          return () =>
            Promise.reject(
              new Error(`"ClockAlarm.${String(prop)}()" is not implemented on android`),
            )
        },
      },
    ),
}))
import { androidClockProvider } from './nativeProviders'
beforeEach(() => {
  vi.resetAllMocks()
  mock.platform.mockReturnValue('android')
  mock.schedule.mockResolvedValue({ opened: true })
})
describe('Android 시계 연결', () => {
  it('사용자가 요청한 출발 시각과 목적지 이름을 넘긴다', async () => {
    const at = new Date(Date.now() + 3600000)
    const r = await androidClockProvider.schedule({ at, title: '부산 출발', body: '' })
    expect(r.ok).toBe(true)
    expect(mock.schedule).toHaveBeenCalledWith({ hour: at.getHours(), minute: at.getMinutes(), label: '부산 출발' })
  })
  it('웹에서는 네이티브 알람을 부르지 않는다', async () => {
    mock.platform.mockReturnValue('web')
    expect((await androidClockProvider.schedule({ at: new Date(), title: '', body: '' })).ok).toBe(false)
    expect(mock.schedule).not.toHaveBeenCalled()
  })
  it('시계 앱이 없으면 성공으로 표시하지 않는다', async () => {
    mock.schedule.mockRejectedValue(new Error('no-clock-app'))
    const r = await androidClockProvider.schedule({ at: new Date(Date.now() + 3600000), title: '', body: '' })
    expect(r.ok).toBe(false)
  })
})
