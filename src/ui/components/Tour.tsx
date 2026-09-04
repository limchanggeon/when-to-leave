import { useEffect, useRef, useState } from 'react'
import type { I18nShape } from '../../i18n'

/**
 * 사용법 — 실제 화면을 짚어준다.
 *
 * 처음에는 캡처를 넘겨 보여줬는데(슬라이드 온보딩) 두 가지가 걸렸다.
 * 화면을 고칠 때마다 캡처가 낡았고, 보는 사람은 아무것도 하지 않았다.
 * 지금은 살아 있는 UI 위에 구멍을 뚫어 짚는다 — 낡을 캡처가 없고,
 * 짚어준 자리에 바로 입력할 수 있다.
 *
 * 오버레이는 클릭을 막지 않는다(`pointer-events: none`). 막으면 짚어준
 * 칸에 글자를 넣을 수 없어서, 안내가 아니라 방해가 된다. 그래서 <dialog>
 * 도 쓰지 않는다 — showModal 은 바깥을 통째로 잠근다.
 */
interface Step {
  /** 비추는 자리. 없으면 그 걸음은 건너뛴다. */
  target: string
  /**
   * 참이 되면 저절로 다음 걸음으로 넘어간다.
   *
   * 화면(DOM)을 직접 읽는다. 목적지·도착 시각은 검색 패널 안에 든 값이라
   * 여기까지 끌어오려면 그 상태를 통째로 밖으로 빼야 하는데, 짚어줄 자리를
   * 어차피 DOM 에서 재고 있으므로 같은 자리에서 값도 읽는 편이 덜 억지스럽다.
   */
  done?: () => boolean
}

const filled = (sel: string): boolean => {
  const el = document.querySelector(sel)
  return el instanceof HTMLInputElement && el.value.trim().length > 0
}

const STEPS: Step[] = [
  { target: '#field-to', done: () => filled('#field-to') },
  { target: '.panel__row--time', done: () => filled('#field-when') },
  { target: '.panel__submit', done: () => document.querySelector('.verdict__time') !== null },
  { target: '.board__slot' },
]

/** 구멍은 대상보다 조금 넉넉해야 테두리가 글자를 물지 않는다. */
const PAD = 8

interface Box {
  top: number
  left: number
  width: number
  height: number
}

export function Tour({ t, open, onClose }: { t: I18nShape; open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  /**
   * 이 걸음을 보여주기 시작할 때 이미 조건이 참이었는지.
   *
   * 결과를 띄워둔 채로 열면 1~3번 조건이 모두 참이라 마지막 걸음까지
   * 순식간에 지나가 버린다. 보여준 뒤에 참이 된 경우에만 넘어간다.
   */
  const wasDone = useRef(false)
  const steps = t.tour.steps
  const last = step === STEPS.length - 1

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  // 걸음이 바뀌면 대상을 화면 안으로 들이고, 입력칸이면 초점까지 준다 —
  // 짚어주자마자 바로 칠 수 있어야 안내가 흐름을 끊지 않는다.
  useEffect(() => {
    if (!open) return
    const el = document.querySelector(STEPS[step].target)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true })
    wasDone.current = STEPS[step].done?.() ?? false
  }, [open, step])

  // 구멍이 대상에 붙어 있어야 한다. 계산을 누르면 판이 통째로 바뀌므로
  // 한 번 재고 마는 게 아니라 매 프레임 따라간다(열려 있는 동안만).
  useEffect(() => {
    if (!open) return
    let raf = 0
    let advanced = false
    const tick = () => {
      const el = document.querySelector(STEPS[step].target)
      if (el) {
        const r = el.getBoundingClientRect()
        setBox({
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
        })
      } else {
        setBox(null)
      }

      if (!advanced && !last && !wasDone.current && STEPS[step].done?.()) {
        advanced = true
        setStep((n) => n + 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, step, last])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  /*
   * 설명 카드는 짚은 자리 아래에, 자리가 모자라면 위에 붙인다.
   * 좁은 화면에서는 계산하지 않고 아래에 고정한다(CSS) — 손가락이 닿는 자리고,
   * 어느 걸음이든 같은 자리에 있어야 눈이 카드를 찾아다니지 않는다.
   */
  const below = box ? box.top + box.height + 12 : 0
  const room = box ? window.innerHeight - (box.top + box.height) > 220 : true

  return (
    <>
      {box && <div className="tour__hole" style={{ ...box }} aria-hidden="true" />}

      <div
        className="tour__card"
        role="dialog"
        aria-labelledby="tour-title"
        style={box ? (room ? { top: below } : { bottom: window.innerHeight - box.top + 12 }) : undefined}
      >
        <div className="tour__top">
          <span className="tour__count num">{t.tour.step(step + 1, STEPS.length)}</span>
          <button type="button" className="tour__x" onClick={onClose} aria-label={t.tour.close}>
            ✕
          </button>
        </div>
        <h2 className="tour__title" id="tour-title">
          {steps[step].title}
        </h2>
        <p className="tour__body">{steps[step].body}</p>
        <div className="tour__foot">
          <div className="tour__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.title} className={`tour__dot ${i === step ? 'is-on' : ''}`} />
            ))}
          </div>
          <div className="tour__nav">
            <button
              type="button"
              className="tour__btn"
              onClick={() => setStep((n) => n - 1)}
              disabled={step === 0}
            >
              {t.tour.prev}
            </button>
            <button
              type="button"
              className="tour__btn tour__btn--go"
              onClick={() => (last ? onClose() : setStep((n) => n + 1))}
            >
              {last ? t.tour.done : t.tour.next}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
