import { useEffect, useRef, useState } from 'react'
import type { I18nShape } from '../../i18n'
import { SponsorHeart } from './BrandMarks'

const SPONSOR = 'https://github.com/sponsors/limchanggeon'

/**
 * 하루 한도를 다 쓴 회원에게 보이는 창.
 *
 * 비회원 창(SignUpWall)과 하는 말이 다르다. 저쪽은 "로그인하세요" 고
 * 여기는 "내일 다시 열립니다, 더 필요하면 후원해 주세요" 다.
 * **막다른 길로 두지 않는다** — 닫으면 내일 다시 쓸 수 있고, 급하면
 * 후원하고 요청할 수 있다.
 *
 * 깃허브 스폰서와 우리 계정을 자동으로 잇는 길이 없어서 요청은 사람이
 * 확인한다. 그 사실을 숨기지 않고 "맞춰보고 올려드립니다" 라고 적는다.
 */
export function QuotaWall({
  open,
  onClose,
  limit,
  t,
}: {
  open: boolean
  onClose: () => void
  limit: number
  t: I18nShape
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const q = t.quota
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  const close = () => {
    onClose()
    setAsking(false)
    setSent(false)
    setNote('')
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (busy || note.trim().length < 2) return
    setBusy(true)
    try {
      const r = await fetch('/api/me/tier-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: note.trim() }),
      })
      if (r.ok) setSent(true)
    } catch {
      /* 못 보냈으면 버튼이 그대로 남는다 — 다시 누르면 된다 */
    }
    setBusy(false)
  }

  return (
    <dialog className="wall" ref={ref} onClose={close} aria-labelledby="quota-title">
      <div className="wall__body">
        <h2 className="wall__title" id="quota-title">
          {q.title}
        </h2>
        <p className="wall__lead">{q.lead(limit)}</p>

        {sent ? (
          <p className="wall__done">{q.askDone}</p>
        ) : asking ? (
          <form onSubmit={send}>
            <p className="wall__lead">{q.askLead}</p>
            <input
              className="wall__input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={q.askPlaceholder}
              autoComplete="off"
              required
            />
            <div className="wall__acts">
              <button type="submit" className="wall__go" disabled={busy || note.trim().length < 2}>
                {q.askSend}
              </button>
              <button type="button" className="wall__later" onClick={() => setAsking(false)}>
                {q.close}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="wall__lead">{q.sponsorLead}</p>
            <div className="wall__acts">
              <a className="wall__go wall__go--sponsor" href={SPONSOR} target="_blank" rel="noreferrer">
                <SponsorHeart />
                {q.sponsor}
              </a>
              <button type="button" className="wall__ask" onClick={() => setAsking(true)}>
                {q.already}
              </button>
              <button type="button" className="wall__later" onClick={close}>
                {q.close}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
