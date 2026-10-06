import { expect, it, vi } from 'vitest'
vi.mock('./tago', () => ({
  TAGO: { expBus: 'express', suburbsBus: 'suburbs', flight: 'flight' },
  tagoCall: vi.fn(),
}))
import { tagoCall } from './tago'
import { terminalKnown } from './tagoSchedules'

it('부팅 직후 터미널 목록 실패가 다음 검색을 영구 실패로 만들지 않는다', async () => {
  vi.mocked(tagoCall).mockResolvedValueOnce(null).mockResolvedValueOnce([
    { terminalId: 'test-terminal', terminalNm: '대전복합' },
  ])
  // 목록 장애 때는 기존 정책대로 후보를 허용한다. 회복 후에는 실제 목록으로 거른다.
  expect(await terminalKnown('expressBus', '없는터미널')).toBe(true)
  expect(await terminalKnown('expressBus', '없는터미널')).toBe(false)
  expect(await terminalKnown('expressBus', '대전복합')).toBe(true)
  expect(tagoCall).toHaveBeenCalledTimes(2)
})
