import { useState } from 'react'
import { loginWithEmail, registerWithEmail, resendVerification } from '../../auth/api'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape } from '../../i18n'

type Tab = 'login' | 'register'

/** 이메일·비밀번호 로그인/회원가입. 소셜 버튼과 같은 화면에 둔다. */
export function EmailAuthForm({ t }: { t: I18nShape }) {
  const { applyResult } = useAuthContext()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 메일을 보낸 뒤의 상태. 폼을 치우고 "받은편지함을 보세요" 로 바꾼다 —
   * 가입 직후 할 일은 이 화면에 더 입력하는 게 아니라 메일을 여는 것이다.
   */
  const [sentTo, setSentTo] = useState<string | null>(null)
  /** 로그인은 됐는데 주소가 아직 확인되지 않은 경우. 다시 보내기를 붙인다. */
  const [needsVerify, setNeedsVerify] = useState(false)

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)

    setNeedsVerify(false)

    const r =
      tab === 'login'
        ? await loginWithEmail(email.trim(), password)
        : await registerWithEmail(email.trim(), password, name.trim())

    if (r.ok) {
      // 가입은 계정 대신 "보냈다" 만 온다. 링크를 눌러야 로그인된다.
      if ('sent' in r) setSentTo(email.trim())
      else applyResult({ ok: true, account: r.account })
    } else {
      setError(r.message)
      setNeedsVerify(r.code === 'email-unverified')
    }
    setBusy(false)
  }

  async function resend() {
    setBusy(true)
    await resendVerification(email.trim())
    setBusy(false)
    setSentTo(email.trim())
    setNeedsVerify(false)
    setError(null)
  }

  /*
   * 메일을 보낸 뒤. 여기서 더 받을 입력이 없다.
   *
   * 주소를 그대로 보여준다 — 오타를 냈으면 여기서 알아채야 하고,
   * 그때 돌아가서 고칠 수 있어야 한다.
   */
  if (sentTo) {
    return (
      <div className="emailauth emailauth--sent">
        <h3 className="emailauth__senttitle">{t.emailAuth.sentTitle}</h3>
        <p className="emailauth__sentto num">{sentTo}</p>
        <p className="emailauth__senthint">{t.emailAuth.sentHint}</p>
        <button
          type="button"
          className="emailauth__back"
          onClick={() => {
            setSentTo(null)
            setPassword('')
          }}
        >
          {t.emailAuth.sentBack}
        </button>
      </div>
    )
  }

  return (
    <form className="emailauth" onSubmit={submit}>
      <div className="emailauth__tabs" role="group">
        {(['login', 'register'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`emailauth__tab ${tab === id ? 'is-on' : ''}`}
            onClick={() => {
              setTab(id)
              setError(null)
            }}
            aria-pressed={tab === id}
          >
            {id === 'login' ? t.emailAuth.tabLogin : t.emailAuth.tabRegister}
          </button>
        ))}
      </div>

      <label className="emailauth__field">
        <span>{t.emailAuth.email}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailAuth.emailPlaceholder}
          autoComplete="email"
          required
        />
      </label>

      <label className="emailauth__field">
        <span>{t.emailAuth.password}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.emailAuth.passwordPlaceholder}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          required
        />
        {tab === 'register' && <em className="emailauth__hint">{t.emailAuth.passwordHint}</em>}
      </label>

      {tab === 'register' && (
        <label className="emailauth__field">
          <span>{t.emailAuth.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.emailAuth.namePlaceholder}
            autoComplete="name"
          />
        </label>
      )}

      {error && (
        <p className="emailauth__error" role="alert">
          {error}
          {needsVerify && (
            <button type="button" className="emailauth__resend" onClick={resend} disabled={busy}>
              {t.emailAuth.resend}
            </button>
          )}
        </p>
      )}

      <button className="emailauth__submit" type="submit" disabled={!canSubmit}>
        {busy
          ? t.emailAuth.working
          : tab === 'login'
            ? t.emailAuth.submitLogin
            : t.emailAuth.submitRegister}
      </button>
    </form>
  )
}
