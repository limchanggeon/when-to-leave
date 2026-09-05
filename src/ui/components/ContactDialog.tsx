import { useEffect, useId, useRef, useState } from 'react'
import type { I18nShape } from '../../i18n'

const BODY_MAX = 4000

type Phase = 'writing' | 'sending' | 'done'

/**
 * 문의 팝업.
 *
 * <dialog showModal> 을 쓴다. 사용법(Tour)이 <dialog> 를 피한 건 짚어준 칸에
 * 글자를 넣어야 해서였는데, 여기는 반대다 — 이 창 안에서만 입력하면 되므로
 * 바깥을 잠그는 편이 낫다. 그 대가로 Esc 와 초점 가두기를 브라우저가 해준다.
 *
 * 열려 있을 때만 flex 가 되게 `[open]` 으로 묶는다. 그냥 `display: flex` 를
 * 주면 UA 의 `display: none` 을 이겨서 닫힌 창이 화면을 덮는다 —
 * 사용법 창에서 실제로 그랬다.
 */
export function ContactDialog({
  t,
  open,
  onClose,
  defaultEmail,
}: {
  t: I18nShape
  open: boolean
  onClose: () => void
  defaultEmail?: string | null
}) {
  const c = t.contact
  const ref = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [body, setBody] = useState('')
  const [phase, setPhase] = useState<Phase>('writing')
  const [error, setError] = useState<string | null>(null)
  const emailId = useId()
  const bodyId = useId()
  const hintId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  /* 로그인해서 주소를 알게 되면 채워준다 — 이미 적고 있으면 건드리지 않는다. */
  useEffect(() => {
    if (defaultEmail && !email) setEmail(defaultEmail)
  }, [defaultEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  /* 닫을 때 되돌린다. 다음에 열었을 때 지난 문의가 남아 있으면 안 된다. */
  const close = () => {
    onClose()
    setPhase('writing')
    setBody('')
    setError(null)
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (phase === 'sending') return
    setPhase('sending')
    setError(null)

    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, body, website: form.get('website') ?? '' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error?.message ?? c.failed)
        setPhase('writing')
        return
      }
      setPhase('done')
    } catch {
      setError(c.failed)
      setPhase('writing')
    }
  }

  return (
    <dialog className="contact" ref={ref} onClose={close} aria-labelledby={`${emailId}-title`}>
      {phase === 'done' ? (
        <div className="contact__done">
          <h2 className="contact__title" id={`${emailId}-title`}>
            {c.doneTitle}
          </h2>
          <p className="contact__lead">{c.doneBody}</p>
          <button type="button" className="contact__send" onClick={close}>
            {c.close}
          </button>
        </div>
      ) : (
        <form className="contact__form" onSubmit={submit}>
          <h2 className="contact__title" id={`${emailId}-title`}>
            {c.title}
          </h2>
          <p className="contact__lead">{c.lead}</p>

          <label className="contact__label" htmlFor={emailId}>
            {c.emailLabel}
          </label>
          <input
            id={emailId}
            className="contact__input"
            type="email"
            required
            autoComplete="email"
            aria-describedby={hintId}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="contact__hint" id={hintId}>
            {c.emailHint}
          </p>

          <label className="contact__label" htmlFor={bodyId}>
            {c.bodyLabel}
          </label>
          <textarea
            id={bodyId}
            className="contact__area"
            required
            minLength={10}
            maxLength={BODY_MAX}
            rows={7}
            placeholder={c.bodyPlaceholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="contact__count">{c.counter(body.length, BODY_MAX)}</p>

          {/*
            미끼 칸. 사람 눈에는 안 보이고 스크린리더도 건너뛴다.
            봇은 채우는데, 채워져 오면 서버가 조용히 버린다.
          */}
          <input
            className="contact__trap"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          {error && (
            <p className="contact__error" role="alert">
              {error}
            </p>
          )}

          <div className="contact__actions">
            <button type="button" className="contact__cancel" onClick={close}>
              {c.cancel}
            </button>
            <button type="submit" className="contact__send" disabled={phase === 'sending'}>
              {phase === 'sending' ? c.sending : c.submit}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
