import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'
import * as api from '../../auth/me'
import type { MeSummary, SavedPlace } from '../../auth/me'
import { calendarProvider, connectCalendar } from '../../alarm/calendarProvider'
import { locate } from '../../geo'
import { reverseGeocode } from '../../geo/reverse'
import { dictionaries } from '../../i18n'
import { usePrefs } from '../PrefsContext'
import { SiteHeader } from '../components/SiteHeader'
import { SiteFooter } from '../components/SiteFooter'

export function MyPage() {
  const { lang } = usePrefs()
  const t = dictionaries[lang]
  const { account, signOut } = useAuthContext()
  const navigate = useNavigate()

  const [me, setMe] = useState<MeSummary | null>(null)
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = () =>
    api.fetchMe().then((r) => (r.ok ? setMe(r.data) : setError(r.message)))

  useEffect(() => {
    void reload()
  }, [])

  // 캘린더 동의에서 돌아온 결과를 한 번 보여주고 주소에서 지운다
  useEffect(() => {
    const status = params.get('calendar')
    if (!status) return
    const known = t.calendar.status as Record<string, string>
    setNotice(known[status] ?? t.calendar.status.failed)
    params.delete('calendar')
    setParams(params, { replace: true })
    const id = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 로그아웃 상태로 남아 있을 이유가 없다
  useEffect(() => {
    if (account === null && me === null) {
      const id = setTimeout(() => {
        if (!account) navigate('/login', { replace: true })
      }, 800)
      return () => clearTimeout(id)
    }
  }, [account, me, navigate])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 2500)
  }

  return (
    <div className="page">
      <SiteHeader t={t} solid />
      <div className="shell">
        <Link className="mypage__back" to="/">
          {t.myPage.back}
        </Link>
        <h1 className="mypage__title">{t.myPage.title}</h1>

        {error && (
          <p className="notice notice--bad" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice notice--ok" role="status">
            {notice}
          </p>
        )}

        {me && (
          <>
            <ProfileSection t={t} me={me} onSaved={(m) => { setMe(m); flash(t.myPage.saved) }} />
            <PlacesSection t={t} places={me.places} onChanged={reload} onError={setError} />
            <CalendarSection t={t} onError={setError} />
            <LinkedSection t={t} identities={me.identities} />
            <PasswordSection
              t={t}
              hasPassword={me.meta?.hasPassword ?? false}
              onDone={() => { void reload(); flash(t.myPage.passwordChanged) }}
              onError={setError}
            />
            <DangerSection t={t} onDeleted={async () => { await signOut(); navigate('/', { replace: true }) }} onError={setError} />
          </>
        )}
      </div>
      <SiteFooter t={t} />
    </div>
  )
}

function ProfileSection({
  t,
  me,
  onSaved,
}: {
  t: typeof dictionaries.ko
  me: MeSummary
  onSaved: (m: MeSummary) => void
}) {
  const [name, setName] = useState(me.account.name ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <section className="card">
      <h2 className="card__title">{t.myPage.profile}</h2>
      <dl className="kv">
        <dt>{t.myPage.email}</dt>
        <dd>{me.account.email}</dd>
        {me.meta && (
          <>
            <dt>{t.myPage.joined}</dt>
            <dd>{new Date(me.meta.createdAt).toLocaleDateString()}</dd>
          </>
        )}
      </dl>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const r = await api.updateName(name)
          if (r.ok) onSaved({ ...me, account: r.data.account })
          setBusy(false)
        }}
      >
        <label className="field field--grow">
          <span className="field__label">{t.myPage.name}</span>
          <input className="field__input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {t.myPage.save}
        </button>
      </form>
    </section>
  )
}

function PlacesSection({
  t,
  places,
  onChanged,
  onError,
}: {
  t: typeof dictionaries.ko
  places: SavedPlace[]
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [label, setLabel] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function useCurrent() {
    setBusy(true)
    const located = await locate()
    if (!located.ok) {
      onError(t.geo.err[located.failure.code])
      setBusy(false)
      return
    }
    const named = await reverseGeocode(located.data)
    setName(named.ok ? named.data : `${located.data.lat.toFixed(5)}, ${located.data.lng.toFixed(5)}`)
    setBusy(false)
  }

  return (
    <section className="card">
      <h2 className="card__title">{t.myPage.places}</h2>
      <p className="card__hint">{t.myPage.placesHint}</p>

      {places.length === 0 ? (
        <p className="card__empty">{t.myPage.noPlaces}</p>
      ) : (
        <ul className="places">
          {places.map((p) => (
            <li className="places__item" key={p.id}>
              <span className="places__label">{p.label}</span>
              <span className="places__name">{p.name}</span>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={async () => {
                  const r = await api.removePlace(p.id)
                  if (r.ok) onChanged()
                  else onError(r.message)
                }}
              >
                {t.myPage.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="row row--wrap"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const r = await api.addPlace({ label, name })
          if (r.ok) {
            setLabel('')
            setName('')
            onChanged()
          } else onError(r.message)
          setBusy(false)
        }}
      >
        <label className="field field--short">
          <span className="field__label">{t.myPage.placeLabel}</span>
          <input
            className="field__input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t.myPage.placeLabelPlaceholder}
            required
          />
        </label>
        <label className="field field--grow">
          <span className="field__label">{t.myPage.placeName}</span>
          <input
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.myPage.placeNamePlaceholder}
            required
          />
        </label>
        <button className="btn btn--ghost" type="button" onClick={useCurrent} disabled={busy}>
          {t.myPage.useCurrent}
        </button>
        <button className="btn" type="submit" disabled={busy}>
          {t.myPage.add}
        </button>
      </form>
    </section>
  )
}

function LinkedSection({
  t,
  identities,
}: {
  t: typeof dictionaries.ko
  identities: MeSummary['identities']
}) {
  return (
    <section className="card">
      <h2 className="card__title">{t.myPage.linked}</h2>
      {identities.length === 0 ? (
        <p className="card__empty">{t.myPage.noLinked}</p>
      ) : (
        <ul className="places">
          {identities.map((i) => (
            <li className="places__item" key={i.provider}>
              <span className="places__label">{i.provider}</span>
              <span className="places__name">{new Date(i.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PasswordSection({
  t,
  hasPassword,
  onDone,
  onError,
}: {
  t: typeof dictionaries.ko
  hasPassword: boolean
  onDone: () => void
  onError: (m: string) => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <section className="card">
      <h2 className="card__title">{t.myPage.passwordSection}</h2>
      {!hasPassword && <p className="card__hint">{t.myPage.noPasswordYet}</p>}
      <form
        className="row row--wrap"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const r = await api.changePassword(hasPassword ? current : undefined, next)
          if (r.ok) {
            setCurrent('')
            setNext('')
            onDone()
          } else onError(r.message)
          setBusy(false)
        }}
      >
        {hasPassword && (
          <label className="field field--grow">
            <span className="field__label">{t.myPage.currentPassword}</span>
            <input
              className="field__input"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}
        <label className="field field--grow">
          <span className="field__label">{t.myPage.newPassword}</span>
          <input
            className="field__input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {hasPassword ? t.myPage.changePassword : t.myPage.setPassword}
        </button>
      </form>
    </section>
  )
}

function DangerSection({
  t,
  onDeleted,
  onError,
}: {
  t: typeof dictionaries.ko
  onDeleted: () => void
  onError: (m: string) => void
}) {
  return (
    <section className="card card--danger">
      <h2 className="card__title">{t.myPage.danger}</h2>
      <p className="card__hint">{t.myPage.dangerHint}</p>
      <button
        className="btn btn--danger"
        type="button"
        onClick={async () => {
          if (!window.confirm(t.myPage.confirmDelete)) return
          const r = await api.deleteAccount()
          if (r.ok) onDeleted()
          else onError(r.message)
        }}
      >
        {t.myPage.deleteAccount}
      </button>
    </section>
  )
}

function CalendarSection({
  t,
  onError,
}: {
  t: typeof dictionaries.ko
  onError: (m: string) => void
}) {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    calendarProvider.needsSetup().then((needs) => setConnected(!needs))
  }, [])

  return (
    <section className="card">
      <h2 className="card__title">{t.calendar.section}</h2>
      <p className="card__hint">{t.calendar.hint}</p>
      <p className="card__hint">{t.calendar.testModeNote}</p>
      {connected === null ? null : connected ? (
        <div className="row">
          <span className="chip chip--good">{t.calendar.connected}</span>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={async () => {
              await fetch('/api/calendar/disconnect', { method: 'POST', credentials: 'include' })
              setConnected(false)
            }}
          >
            {t.calendar.disconnect}
          </button>
        </div>
      ) : (
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const url = await connectCalendar()
            if (url) window.location.href = url
            else onError(t.calendar.status.failed)
          }}
        >
          {t.calendar.connect}
        </button>
      )}
    </section>
  )
}
