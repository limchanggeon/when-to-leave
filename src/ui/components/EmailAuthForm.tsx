import { useId, useState } from 'react'
import { checkEmailAvailable, loginWithEmail, registerWithEmail, resendVerification } from '../../auth/api'
import { useAuthContext } from '../../auth/AuthContext'
import type { I18nShape } from '../../i18n'

type Tab = 'login' | 'register'

/** 이메일·비밀번호 로그인/회원가입. 소셜 버튼과 같은 화면에 둔다. */
export function EmailAuthForm({ t }: { t: I18nShape }) {
  const { applyResult } = useAuthContext()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  /** 가입에서만 쓴다. 오타로 못 들어가는 계정이 생기는 걸 막는다. */
  const [password2, setPassword2] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 메일을 보낸 뒤의 상태. 폼을 치우고 "받은편지함을 보세요" 로 바꾼다 —
   * 가입 직후 할 일은 이 화면에 더 입력하는 게 아니라 메일을 여는 것이다.
   */
  const [sentTo, setSentTo] = useState<string | null>(null)
  /**
   * 중복확인 결과. 서버가 시간당 20번만 답하므로 글자를 칠 때마다 묻지 않고
   * 버튼을 눌렀을 때만 묻는다 — 자동이면 주소 하나 적는 동안 다 써버린다.
   */
  const [avail, setAvail] = useState<null | 'checking' | 'free' | 'taken' | string>(null)
  const emailId = useId()
  /** 로그인은 됐는데 주소가 아직 확인되지 않은 경우. 다시 보내기를 붙인다. */
  const [needsVerify, setNeedsVerify] = useState(false)

  const mismatch = tab === 'register' && password2.length > 0 && password !== password2
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    !busy &&
    (tab === 'login' || (password2.length > 0 && !mismatch))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)

    setNeedsVerify(false)

    if (tab === 'register' && password !== password2) {
      setError(t.emailAuth.mismatch)
      setBusy(false)
      return
    }

    const r =
      tab === 'login'
        ? await loginWithEmail(email.trim(), password)
        : await registerWithEmail(email.trim(), password, name.trim())

    if (r.ok) {
      // 가입은 계정 대신 "보냈다" 만 온다. 링크를 눌러야 로그인된다.
      if ('sent' in r) {
        setSentTo(email.trim())
      }
      else applyResult({ ok: true, account: r.account })
    } else {
      setError(r.message)
      /*
       * 다시 보내기는 **주소 확인이 안 된 경우에만** 뜻이 있다.
       * 승인 대기(not-approved)에 그 버튼을 붙이면, 사람이 열어줘야 하는
       * 일을 메일 버튼만 계속 누르며 기다리게 된다.
       */
      setNeedsVerify(r.code === 'email-unverified')
    }
    setBusy(false)
  }

  async function resend() {
    setBusy(true)
    const r = await resendVerification(email.trim())
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
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
        {error && <p className="emailauth__error" role="alert">{error}</p>}
        <button type="button" className="emailauth__resend" onClick={resend} disabled={busy}>
          {busy ? t.emailAuth.working : t.emailAuth.resend}
        </button>
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

      {/*
        이메일 칸만 <label> 을 쓰지 않고 htmlFor 로 잇는다.

        중복확인 버튼을 입력 옆에 두어야 하는데, <label> 안에 버튼이 들어가면
        버튼을 눌러도 클릭이 입력창으로 넘어간다 — 이 저장소가 예전에 사파리에서
        겪은 버그이고 README 에 적혀 있다. 라벨은 글자만 감싸고 버튼은 밖에 둔다.
      */}
      <div className="emailauth__field">
        <label htmlFor={emailId}>
          <span>{t.emailAuth.email}</span>
        </label>
        <div className="emailauth__row">
          {/*
            로그인 칸은 이메일 형식을 강제하지 않는다. 서버는 이 값을 그냥
            문자열로 찾으므로 이메일이 아닌 아이디(관리자 계정 등)도 있을 수
            있는데, type="email" 이면 브라우저가 아예 제출을 막는다.
            가입은 진짜 주소를 받아야 하므로 그때만 email 로 둔다.
          */}
          <input
            id={emailId}
            type={tab === 'register' ? 'email' : 'text'}
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              // 주소가 바뀌면 앞 결과를 지운다 — 남겨두면 다른 주소의 답이 된다
              setAvail(null)
            }}
            placeholder={t.emailAuth.emailPlaceholder}
            autoComplete={tab === 'register' ? 'email' : 'username'}
            required
          />
          {tab === 'register' && (
            <button
              type="button"
              className="emailauth__check"
              disabled={!email.trim() || avail === 'checking'}
              onClick={async () => {
                setAvail('checking')
                const r = await checkEmailAvailable(email.trim())
                setAvail(r.ok ? (r.available ? 'free' : 'taken') : r.message)
              }}
            >
              {avail === 'checking' ? t.emailAuth.checking : t.emailAuth.check}
            </button>
          )}
        </div>

        {tab === 'register' && avail === 'free' && (
          <em className="emailauth__hint emailauth__hint--ok">{t.emailAuth.checkFree}</em>
        )}
        {tab === 'register' && avail === 'taken' && (
          <em className="emailauth__hint emailauth__hint--bad">
            {t.emailAuth.checkTaken}{' '}
            <button type="button" className="emailauth__inline" onClick={() => setTab('login')}>
              {t.emailAuth.checkGoLogin}
            </button>
          </em>
        )}
        {/* 형식 오류나 시도 초과 같은 것은 서버 문구를 그대로 보여준다 */}
        {tab === 'register' && avail !== null && !['checking', 'free', 'taken'].includes(avail) && (
          <em className="emailauth__hint emailauth__hint--bad">{avail}</em>
        )}
      </div>

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
          <span>{t.emailAuth.password2}</span>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            required
          />
          {/* 다 치기 전부터 빨갛게 하지 않는다 — 아직 틀린 게 아니라 덜 친 것이다 */}
          {mismatch && (
            <em className="emailauth__hint emailauth__hint--bad" role="alert">
              {t.emailAuth.mismatch}
            </em>
          )}
        </label>
      )}

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
