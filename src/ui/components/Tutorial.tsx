import { useEffect, useRef, useState } from 'react'
import type { I18nShape, Lang } from '../../i18n'

/**
 * 사용법. 글로 설명하지 않고 **실제 화면 캡처**를 넘겨 보여준다.
 *
 * 예전에는 홈에 "이렇게 물어보세요" 예시 칩이 있었는데, 매일 쓰는 도구의
 * 첫 화면을 설명이 차지하고 있었다. 설명은 필요한 사람만 물음표를 눌러
 * 보면 된다.
 *
 * 캡처는 `public/tutorial/{lang}-{n}.png` 에 있고 `pnpm shots` 로 다시 찍는다.
 * 화면을 고치면 같이 낡으므로, 시각 언어를 손댈 때는 다시 찍을 것.
 *
 * <dialog> 를 쓴다 — 초점 가두기와 Esc 닫기를 브라우저가 해준다.
 * 직접 만들면 그 둘을 빠뜨리기 쉽다.
 */
export function Tutorial({
  t,
  lang,
  open,
  onClose,
}: {
  t: I18nShape
  lang: Lang
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState(0)
  const steps = t.tutorial.steps
  const last = step === steps.length - 1

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open) {
      setStep(0)
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [open])

  return (
    <dialog
      className="tut"
      ref={ref}
      aria-labelledby="tut-title"
      // Esc 로 닫아도 바깥 상태가 따라오게 한다. 안 그러면 다시 못 연다.
      onClose={onClose}
      // 판 바깥(backdrop)을 누르면 닫는다. dialog 자체가 클릭 대상이라
      // 안쪽을 눌렀는지 바깥을 눌렀는지는 좌표로 가른다.
      onClick={(e) => {
        const box = ref.current?.getBoundingClientRect()
        if (!box) return
        const inside =
          e.clientX >= box.left &&
          e.clientX <= box.right &&
          e.clientY >= box.top &&
          e.clientY <= box.bottom
        if (!inside) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setStep((n) => Math.min(steps.length - 1, n + 1))
        if (e.key === 'ArrowLeft') setStep((n) => Math.max(0, n - 1))
      }}
    >
      <div className="tut__head">
        <h2 className="tut__title" id="tut-title">
          {t.tutorial.title}
        </h2>
        <button type="button" className="tut__x" onClick={onClose} aria-label={t.tutorial.close}>
          ✕
        </button>
      </div>

      {/* 캡처는 옆의 글이 뜻을 다 담고 있어 대체 텍스트를 비운다 —
          같은 말을 두 번 읽히면 화면 낭독기에서 더 시끄럽다. */}
      <img className="tut__shot" src={`/tutorial/${lang}-${step + 1}.png`} alt="" />

      <div className="tut__body">
        <p className="tut__count num">{t.tutorial.step(step + 1, steps.length)}</p>
        <h3 className="tut__steptitle">{steps[step].title}</h3>
        <p className="tut__steptext">{steps[step].body}</p>
      </div>

      <div className="tut__foot">
        <div className="tut__dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={`tut__dot ${i === step ? 'is-on' : ''}`} />
          ))}
        </div>
        <div className="tut__nav">
          <button
            type="button"
            className="tut__btn"
            onClick={() => setStep((n) => n - 1)}
            disabled={step === 0}
          >
            {t.tutorial.prev}
          </button>
          <button
            type="button"
            className="tut__btn tut__btn--go"
            onClick={() => (last ? onClose() : setStep((n) => n + 1))}
          >
            {last ? t.tutorial.done : t.tutorial.next}
          </button>
        </div>
      </div>
    </dialog>
  )
}
