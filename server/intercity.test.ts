import { describe, expect, it } from 'vitest'
import { INTERCITY_STOP } from './intercity'
import { normalize } from './tagoSchedules'

/*
 * 인천공항의 공항버스 승차장이 후보에서 통째로 빠지던 것을 잡아둔다
 * (2026-09-05). 카카오 분류가 "터미널" 이 아니라 "정류장" 이라, 터미널만
 * 받는 필터가 걸러버렸다. 그래서 대전 → 인천공항에 공항버스가 아니라
 * 환승 3회짜리 시내 경로가 답으로 나왔다.
 */
describe('시외 허브 분류 필터', () => {
  it('공항버스 승차장을 받는다 — 분류가 터미널이 아니라 정류장이다', () => {
    expect(INTERCITY_STOP.test('교통,수송 > 버스,고속버스 > 고속,시외버스정류장')).toBe(true)
  })

  it('진짜 터미널도 그대로 받는다', () => {
    expect(INTERCITY_STOP.test('교통,수송 > 버스,고속버스 > 고속,시외버스터미널')).toBe(true)
  })

  it('시내버스 정류장은 거른다 — 시외 허브가 아니다', () => {
    expect(INTERCITY_STOP.test('교통,수송 > 버스 > 시내버스정류장')).toBe(false)
    expect(INTERCITY_STOP.test('교통,수송 > 버스 > 마을버스정류장')).toBe(false)
  })

  it('주차장·카셰어링처럼 섞여 나오는 것도 거른다', () => {
    expect(INTERCITY_STOP.test('교통,수송 > 주차장')).toBe(false)
    expect(INTERCITY_STOP.test('서비스,산업 > 자동차 > 렌터카 > 쏘카존')).toBe(false)
  })
})

describe('터미널 이름 대조', () => {
  it('공항 여객터미널 번호 표기를 맞춘다 — TAGO 는 T1, 카카오는 1터미널', () => {
    // 이게 안 맞으면 인천공항행 공항버스가 후보에서 통째로 빠진다
    expect(normalize('인천공항T1')).toBe(normalize('인천공항1버스터미널'))
    expect(normalize('인천공항T2')).toBe(normalize('인천공항2버스터미널'))
    expect(normalize('인천공항2터미널')).toBe(normalize('인천공항2버스터미널'))
  })

  it('T1 과 T2 를 섞지 않는다', () => {
    expect(normalize('인천공항T1')).not.toBe(normalize('인천공항T2'))
  })

  it('기존 대조는 그대로다', () => {
    expect(normalize('유성복합터미널')).toBe(normalize('유성복합'))
    expect(normalize('대전복합터미널')).toBe(normalize('대전복합'))
    expect(normalize('김포국제공항')).toBe(normalize('김포공항'))
  })
})
