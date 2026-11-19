import { useEffect, useRef, useState } from 'react'
import { useAuthContext } from '../../auth/AuthContext'
import { usePrefs } from '../PrefsContext'

/**
 * 처리방침 동의 기록이 없는 계정에 한 번만 묻는 창.
 *
 * 이메일 가입은 가입 칸에서 동의를 받는다. 카카오·구글은 같은 버튼이 가입도
 * 로그인도 하니 누르기 전엔 처음인지 모른다 — 그래서 들어온 뒤에 묻는다.
 * 닫을 수 없다(Esc 막음). 동의하거나 로그아웃하거나 둘 중 하나다.
 */
export function ConsentGate() {
  const { account, signOut, applyResult } = useAuthContext()
  const { t } = usePrefs()
  const ref = useRef<HTMLDialogElement>(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const open = account?.privacyAgreed === false

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  async function agree() {
    if (!account) return
    setBusy(true)
    const res = await fetch('/api/auth/consent', { method: 'POST', credentials: 'include' }).catch(() => null)
    setBusy(false)
    if (res?.ok) applyResult({ ok: true, account: { ...account, privacyAgreed: true } })
  }

  const g = t.consentGate
  return (
    <dialog className="wall" ref={ref} onCancel={(e) => e.preventDefault()} aria-labelledby="consent-title">
      <div className="wall__body">
        <h2 className="wall__title" id="consent-title">{g.title}</h2>
        <p className="wall__lead">{g.lead}</p>
        <label className="emailauth__consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            {t.emailAuth.consent}{' '}
            <a href="/privacy" target="_blank" rel="noreferrer">{t.emailAuth.consentView}</a>
          </span>
        </label>
        <div className="wall__acts">
          <button type="button" className="wall__go" disabled={!agreed || busy} onClick={agree}>
            {g.agree}
          </button>
          <button type="button" className="wall__later" onClick={() => void signOut()}>
            {g.logout}
          </button>
        </div>
      </div>
    </dialog>
  )
}
