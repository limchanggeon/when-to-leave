import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dictionaries } from '../../i18n'
import { usePrefs } from '../PrefsContext'
import { SiteHeader } from '../components/SiteHeader'
import { DayBars } from '../components/DayBars'
import { AreaTrend } from '../components/AreaTrend'

interface AdminUser {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  emailVerified: boolean
  hasPassword: boolean
  createdAt: number
  providers: string[]
  places: number
  sessions: number
}
interface DayRow {
  day: string
  visit: number
  search: number
  signup: number
  login: number
}
interface Overview {
  days: DayRow[]
  stats: Record<string, number>
  users: AdminUser[]
  log: { id: number; actorEmail: string; action: string; targetEmail: string | null; detail: string | null; createdAt: number }[]
}

interface ContactRow {
  id: string
  fromEmail: string
  body: string
  createdAt: number
  /** null 이면 아직 메일로 못 알렸다는 뜻. 숨기지 않고 표시한다. */
  mailSentAt: number | null
  mailError: string | null
  readAt: number | null
}
interface Inbox {
  messages: ContactRow[]
  unread: number
}

const STAT_LABEL: Record<string, string> = {
  users: '계정',
  verified: '확인됨',
  admins: '관리자',
  places: '저장한 장소',
  activeSessions: '로그인 중',
  signupsLast7d: '최근 7일 가입',
}
const ACTION_LABEL: Record<string, string> = {
  'verify-email': '이메일 확인 처리',
  'delete-user': '계정 삭제',
  'revoke-sessions': '세션 끊기',
  'grant-admin': '관리자 세움',
  'revoke-admin': '관리자 내림',
}

const when = (ms: number) => new Date(ms).toLocaleString('ko-KR')

/**
 * 관리자 화면.
 *
 * 서버가 관리자가 아닌 사람에게 404 를 준다 — 여기 무엇이 있는지조차
 * 알리지 않는다. 화면은 그 404 를 그대로 "없는 주소" 로 보여준다.
 *
 * 되돌릴 수 없는 일(삭제)은 한 번 더 묻는다. 관리자 화면에서 실수는
 * 남의 데이터가 사라지는 일이라 되돌릴 수가 없다.
 */
export function AdminPage() {
  const { lang } = usePrefs()
  const t = dictionaries[lang]
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /** 보고 있는 칸. 몇 개 안 되니 스크롤보다 갈아 끼우는 편이 빠르다. */
  const [tab, setTab] = useState<'overview' | 'users' | 'contact' | 'log'>('overview')
  const [inbox, setInbox] = useState<Inbox | null>(null)

  async function load() {
    const res = await fetch('/api/admin/overview', { credentials: 'include' })
    if (!res.ok) {
      setError(res.status === 404 ? '없는 주소입니다' : '불러오지 못했습니다')
      return
    }
    setData((await res.json()) as Overview)
    setError(null)
  }
  async function loadInbox() {
    const res = await fetch('/api/admin/contact', { credentials: 'include' })
    if (res.ok) setInbox((await res.json()) as Inbox)
  }
  useEffect(() => {
    void load()
    void loadInbox()
  }, [])

  /* 펼쳐 읽는 순간 읽음으로 표시한다 — 따로 누르게 하면 아무도 안 누른다. */
  async function openMessage(id: string, was: number | null) {
    if (was !== null) return
    await fetch(`/api/admin/contact/${id}/read`, { method: 'POST', credentials: 'include' })
    await loadInbox()
  }

  async function act(u: AdminUser, path: string, init: RequestInit, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(u.id)
    const res = await fetch(`/api/admin/users/${u.id}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      setError(j?.error?.message ?? '실패했습니다')
    }
    setBusy(null)
    await load()
  }

  const days = data?.days ?? []
  const searches = days.map((d) => ({ day: d.day, value: d.search }))
  const todaySearch = searches.at(-1)?.value ?? 0
  const yesterdaySearch = searches.at(-2)?.value ?? 0
  /* 어제가 0이면 증감률이 무한대가 된다. 그럴 땐 비율 대신 아무것도 말하지 않는다. */
  const delta =
    yesterdaySearch > 0 ? Math.round(((todaySearch - yesterdaySearch) / yesterdaySearch) * 100) : null

  const unread = inbox?.unread ?? 0
  const TABS = [
    { id: 'overview', label: '개요' },
    { id: 'users', label: '계정' },
    /* 안 읽은 게 있으면 숫자를 달아둔다. 없으면 그냥 이름만 */
    { id: 'contact', label: unread > 0 ? `문의함 ${unread}` : '문의함' },
    { id: 'log', label: '기록' },
  ] as const

  return (
    <div className="page">
      <SiteHeader t={t} solid />
      <div className="admin">
        {/* 판과 같은 색이라 머리글에서 이어져 한 덩어리로 보인다 */}
        <nav className="adminnav" aria-label="관리자 메뉴">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`adminnav__item ${tab === x.id ? 'is-on' : ''}`}
              onClick={() => setTab(x.id)}
              aria-current={tab === x.id ? 'page' : undefined}
            >
              {x.label}
            </button>
          ))}
          <Link className="adminnav__home" to="/">
            ← 홈으로
          </Link>
        </nav>

        <main className="adminmain">
          {error && (
            <div className="notice notice--bad" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {data && tab === 'overview' && (
            <>
              <section className="panel panel--hero">
                <p className="hero__label">오늘 검색</p>
                <p className="hero__value num">{todaySearch.toLocaleString('ko-KR')}</p>
                <p className="hero__delta">
                  {delta === null ? (
                    <span className="hero__flat">어제 기록 없음</span>
                  ) : (
                    <span className={delta >= 0 ? 'hero__up' : 'hero__down'}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% <span>어제 대비</span>
                    </span>
                  )}
                </p>
                <AreaTrend title="최근 30일 검색" points={searches} />
              </section>

              <section className="panel">
                <h2 className="panel__title">지금</h2>
                <dl className="stats stats--paper">
                  {Object.entries(data.stats).map(([k, v]) => (
                    <div className="stats__item" key={k}>
                      <dt>{STAT_LABEL[k] ?? k}</dt>
                      <dd className="num">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="panel">
                <h2 className="panel__title">그 밖의 30일</h2>
                <p className="panel__hint">
                  지표마다 자릿수가 달라 한 축에 겹치지 않고 따로 그린다. 방문은 브라우저
                  세션 수다 — 쿠키도 IP 도 쓰지 않아 같은 사람인지 알 수 없다.
                </p>
                <div className="dashgrid">
                  <DayBars title="방문" points={days.map((d) => ({ day: d.day, value: d.visit }))} total={days.reduce((s, d) => s + d.visit, 0)} />
                  <DayBars title="로그인" points={days.map((d) => ({ day: d.day, value: d.login }))} total={days.reduce((s, d) => s + d.login, 0)} />
                  <DayBars title="가입" points={days.map((d) => ({ day: d.day, value: d.signup }))} total={days.reduce((s, d) => s + d.signup, 0)} />
                </div>
              </section>
            </>
          )}

          {data && tab === 'users' && (
            <section className="panel">
              <h2 className="panel__title">계정 {data.users.length}개</h2>
              <div className="adminlist">
                {data.users.map((u) => (
                  <div className="adminrow" key={u.id}>
                    <div className="adminrow__who">
                      <span className="adminrow__email">{u.email}</span>
                      <span className="adminrow__tags">
                        {u.isAdmin && <span className="chip chip--good">관리자</span>}
                        <span className={`chip ${u.emailVerified ? 'chip--good' : 'chip--bad'}`}>
                          {u.emailVerified ? '확인됨' : '미확인'}
                        </span>
                        {u.hasPassword && <span className="chip chip--muted">비밀번호</span>}
                        {u.providers.map((p) => (
                          <span className="chip chip--muted" key={p}>{p}</span>
                        ))}
                      </span>
                      <span className="adminrow__meta num">
                        가입 {when(u.createdAt)} · 장소 {u.places} · 로그인 중 {u.sessions}
                      </span>
                    </div>
                    <div className="adminrow__acts">
                      {!u.emailVerified && (
                        <button type="button" className="btn btn--ghost" disabled={busy === u.id}
                          onClick={() => act(u, '/verify', { method: 'POST' })}>확인 처리</button>
                      )}
                      {u.sessions > 0 && (
                        <button type="button" className="btn btn--ghost" disabled={busy === u.id}
                          onClick={() => act(u, '/revoke-sessions', { method: 'POST' }, `${u.email} 의 로그인을 전부 끊을까요?`)}>세션 끊기</button>
                      )}
                      <button type="button" className="btn btn--ghost" disabled={busy === u.id}
                        onClick={() => act(u, '/admin', { method: 'POST', body: JSON.stringify({ on: !u.isAdmin }) },
                          u.isAdmin ? `${u.email} 을 관리자에서 내릴까요?` : `${u.email} 을 관리자로 세울까요?`)}>
                        {u.isAdmin ? '관리자 내리기' : '관리자 세우기'}
                      </button>
                      <button type="button" className="btn btn--danger" disabled={busy === u.id}
                        onClick={() => act(u, '', { method: 'DELETE' },
                          `${u.email} 계정을 지웁니다. 저장한 장소와 연동도 함께 사라지고 되돌릴 수 없습니다. 계속할까요?`)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'contact' && (
            <section className="panel">
              <h2 className="panel__title">문의함</h2>
              <p className="panel__hint">
                푸터의 문의하기로 들어온 것. 저장이 먼저라 메일이 막혀도 여기 남는다.
                답장은 적힌 주소로 메일을 보내면 된다.
              </p>
              {inbox === null ? (
                <p className="card__empty">불러오는 중…</p>
              ) : inbox.messages.length === 0 ? (
                <p className="card__empty">아직 없습니다.</p>
              ) : (
                <ul className="inbox">
                  {inbox.messages.map((m) => (
                    <li key={m.id} className={`inbox__item ${m.readAt === null ? 'is-new' : ''}`}>
                      <details onToggle={() => void openMessage(m.id, m.readAt)}>
                        <summary className="inbox__head">
                          <span className="inbox__from">{m.fromEmail}</span>
                          <span className="num inbox__when">{when(m.createdAt)}</span>
                          {/* 메일이 못 나갔으면 그 사실을 숨기지 않는다 */}
                          {m.mailSentAt === null && (
                            <span className="inbox__unsent" title={m.mailError ?? ''}>
                              메일 미발송
                            </span>
                          )}
                        </summary>
                        <p className="inbox__body">{m.body}</p>
                        {m.mailError && <p className="inbox__err">{m.mailError}</p>}
                        <a className="inbox__reply" href={`mailto:${m.fromEmail}`}>
                          메일로 답장하기
                        </a>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {data && tab === 'log' && (
            <section className="panel">
              <h2 className="panel__title">관리 기록</h2>
              <p className="panel__hint">누가 언제 무엇을 했는지. 대상이 지워져도 남는다.</p>
              {data.log.length === 0 ? (
                <p className="card__empty">아직 없습니다.</p>
              ) : (
                <ul className="adminlog">
                  {data.log.map((l) => (
                    <li key={l.id}>
                      <span className="num">{when(l.createdAt)}</span>{' '}
                      <strong>{ACTION_LABEL[l.action] ?? l.action}</strong>{' '}
                      {l.targetEmail && <span>→ {l.targetEmail}</span>}{' '}
                      {l.detail && <span className="adminlog__detail">({l.detail})</span>}{' '}
                      <span className="adminlog__actor">by {l.actorEmail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
