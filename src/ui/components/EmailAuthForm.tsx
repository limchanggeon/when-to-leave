import { useState } from 'react'
import { loginWithEmail, registerWithEmail } from '../../auth/api'
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

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)

    const r =
      tab === 'login'
        ? await loginWithEmail(email.trim(), password)
        : await registerWithEmail(email.trim(), password, name.trim())

    if (r.ok) applyResult({ ok: true, account: r.account })
    else setError(r.message)
    setBusy(false)
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
