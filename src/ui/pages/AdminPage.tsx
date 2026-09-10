import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  approved: boolean
  tier: string
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
interface UserDetail {
  id: string
  email: string
  name: string | null
  tier: string
  isAdmin: boolean
  createdAt: number
  emailVerifiedAt: number | null
  approvedAt: number | null
  approvedBy: string | null
  hasPassword: boolean
  identities: { provider: string; createdAt: number }[]
  sessions: number
  lastLoginAt: number | null
  places: number
  searches: { day: string; count: number }[]
  contacts: number
}

interface TierReq {
  id: string
  userId: string
  email: string
  tier: string
  note: string
  createdAt: number
}

/** 등급 이름. 서버의 server/tiers.ts 와 짝이다 — 한쪽만 고치면 어긋난다. */
const TIER_LABEL: Record<string, string> = {
  free: '무료 (하루 3회)',
  supporter: '후원자 (하루 50회)',
  unlimited: '무제한',
}

const ACTION_LABEL: Record<string, string> = {
  'verify-email': '이메일 확인 처리',
  'delete-user': '계정 삭제',
  'revoke-sessions': '세션 끊기',
  'grant-admin': '관리자 세움',
  'set-tier': '등급 바꿈',
  'revoke-admin': '관리자 내림',
  approve: '가입 승인',
  unapprove: '승인 거둠',
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
  const { t } = usePrefs()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /** 보고 있는 칸. 몇 개 안 되니 스크롤보다 갈아 끼우는 편이 빠르다. */
  const [tab, setTab] = useState<'overview' | 'users' | 'contact' | 'log'>('overview')
  const [inbox, setInbox] = useState<Inbox | null>(null)
  /** 등급 올려달라는 요청. 후원한 사람이 누른다. */
  const [tierReqs, setTierReqs] = useState<TierReq[]>([])
  /** 펼쳐 본 계정의 상세. 한 번에 하나만 연다 — 여럿을 열면 목록이 아니게 된다. */
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)

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
  async function loadTierReqs() {
    const res = await fetch('/api/admin/tier-requests', { credentials: 'include' })
    if (res.ok) setTierReqs(((await res.json()) as { requests: TierReq[] }).requests)
  }
  useEffect(() => {
    void load()
    void loadInbox()
    void loadTierReqs()
  }, [])

  /* 펼칠 때 불러온다. 목록을 그릴 때마다 사람 수만큼 부르지 않으려는 것이다. */
  async function openDetail(id: string) {
    if (detailFor === id) {
      setDetailFor(null)
      setDetail(null)
      return
    }
    setDetailFor(id)
    setDetail(null)
    const res = await fetch(`/api/admin/users/${id}`, { credentials: 'include' })
    if (res.ok) setDetail(((await res.json()) as { user: UserDetail }).user)
  }

  async function changeTier(u: AdminUser, tier: string) {
    setBusy(u.id)
    await fetch(`/api/admin/users/${u.id}/tier`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    })
    setBusy(null)
    await Promise.all([load(), loadTierReqs()])
  }

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
  /* 사람이 손으로 열어줘야 하는 계정. 있으면 탭에 숫자를 달아 눈에 띄게 한다. */
  const pending = (data?.users ?? []).filter((u) => !u.emailVerified && !u.approved).length
  const TABS = [
    { id: 'overview', label: '개요' },
    {
      id: 'users',
      // 승인 대기와 등급 요청을 합쳐 센다 — 둘 다 사람이 손대야 하는 일이다
      label: pending + tierReqs.length > 0 ? `계정 ${pending + tierReqs.length}` : '계정',
    },
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
            <>
            {/*
              등급 요청은 계정 목록보다 먼저 보여준다. 처리할 일이 있는데
              목록 아래에 있으면 스크롤해야 보이고, 그러면 안 본다.
            */}
            {tierReqs.length > 0 && (
              <section className="panel">
                <h2 className="panel__title">등급 요청 {tierReqs.length}건</h2>
                <p className="panel__hint">
                  후원했다며 올려달라는 요청. 적힌 깃허브 아이디를
                  <a href="https://github.com/sponsors/limchanggeon/dashboard" target="_blank" rel="noreferrer"> 스폰서 목록</a>
                  과 맞춰본 뒤 등급을 바꾸면 이 줄은 사라진다.
                </p>
                <ul className="inbox">
                  {tierReqs.map((r) => (
                    <li className="inbox__item is-new" key={r.id}>
                      <div className="inbox__head">
                        <span className="inbox__from">{r.email}</span>
                        <span className="num inbox__when">{when(r.createdAt)}</span>
                      </div>
                      <p className="inbox__body">깃허브: {r.note}</p>
                      <div className="tierreq__acts">
                        <button type="button" className="btn" disabled={busy === r.userId}
                          onClick={() => void changeTier({ id: r.userId } as AdminUser, 'supporter')}>
                          후원자로 올리기
                        </button>
                        <button type="button" className="btn btn--ghost" disabled={busy === r.userId}
                          onClick={async () => {
                            await fetch(`/api/admin/tier-requests/${r.id}/close`, { method: 'POST', credentials: 'include' })
                            await loadTierReqs()
                          }}>
                          올리지 않고 닫기
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="panel">
              <h2 className="panel__title">계정 {data.users.length}개</h2>
              <div className="adminlist">
                {data.users.map((u) => (
                  <div className="adminrow" key={u.id}>
                    <div className="adminrow__who">
                      {/* 이메일이 곧 펼치는 손잡이다 — 따로 버튼을 두면 줄만 길어진다 */}
                      <button
                        type="button"
                        className="adminrow__email"
                        onClick={() => void openDetail(u.id)}
                        aria-expanded={detailFor === u.id}
                      >
                        {u.email}
                        {u.name && <span className="adminrow__name">{u.name}</span>}
                      </button>
                      <span className="adminrow__tags">
                        {u.isAdmin && <span className="chip chip--good">관리자</span>}
                        {/*
                          로그인이 열렸는지를 한 조각으로 말한다. 메일 확인과
                          관리자 승인 중 하나면 열리므로, 둘을 따로 보여주면
                          "미확인인데 왜 들어와지지" 로 읽힌다.
                        */}
                        {u.emailVerified ? (
                          <span className="chip chip--good">확인됨</span>
                        ) : u.approved ? (
                          <span className="chip chip--good">승인됨</span>
                        ) : (
                          <span className="chip chip--bad">승인 대기</span>
                        )}
                        <span className={`chip ${u.tier === 'free' ? 'chip--muted' : 'chip--good'}`}>
                          {TIER_LABEL[u.tier] ?? u.tier}
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
                      {!u.emailVerified && !u.approved && (
                        <button type="button" className="btn" disabled={busy === u.id}
                          onClick={() => act(u, '/approve', { method: 'POST' })}>가입 승인</button>
                      )}
                      {u.approved && !u.emailVerified && (
                        <button type="button" className="btn btn--ghost" disabled={busy === u.id}
                          onClick={() => act(u, '/unapprove', { method: 'POST' }, `${u.email} 의 수동 승인을 거둘까요? 현재 세션은 끊기지만 이메일 인증을 마친 계정은 다시 로그인할 수 있습니다.`)}>승인 거둠</button>
                      )}
                      {/* 등급은 고르는 것이지 누르는 것이 아니다 — 셋 중 하나다 */}
                      <select
                        className="adminrow__tier"
                        value={u.tier}
                        disabled={busy === u.id}
                        aria-label={`${u.email} 등급`}
                        onChange={(e) => void changeTier(u, e.target.value)}
                      >
                        {Object.entries(TIER_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
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

                    {/*
                      상세는 왼쪽 칸이 아니라 **줄 전체**를 쓴다. 칸 안에 두면
                      버튼 자리만큼 좁아져 항목이 세로로 길게 늘어선다.
                    */}
                    {detailFor === u.id && (
                      <div className="udetail">
                        {!detail ? (
                          <p className="udetail__loading">불러오는 중…</p>
                        ) : (
                          <>
                            <dl className="udetail__grid">
                              <div><dt>이름</dt><dd>{detail.name ?? '—'}</dd></div>
                              <div><dt>등급</dt><dd>{TIER_LABEL[detail.tier] ?? detail.tier}</dd></div>
                              <div><dt>가입</dt><dd className="num">{when(detail.createdAt)}</dd></div>
                              <div><dt>주소 확인</dt><dd className="num">{detail.emailVerifiedAt ? when(detail.emailVerifiedAt) : '안 됨'}</dd></div>
                              <div>
                                <dt>승인</dt>
                                <dd className="num">
                                  {detail.approvedAt
                                    ? `${when(detail.approvedAt)}${detail.approvedBy ? ` · ${detail.approvedBy}` : ''}`
                                    : '대기 중'}
                                </dd>
                              </div>
                              <div><dt>마지막 로그인</dt><dd className="num">{detail.lastLoginAt ? when(detail.lastLoginAt) : '기록 없음'}</dd></div>
                              <div>
                                <dt>로그인 수단</dt>
                                <dd>
                                  {[detail.hasPassword ? '비밀번호' : null, ...detail.identities.map((i) => i.provider)]
                                    .filter(Boolean)
                                    .join(', ') || '없음'}
                                </dd>
                              </div>
                              <div><dt>문의</dt><dd className="num">{detail.contacts}건</dd></div>
                            </dl>

                            <p className="udetail__label">최근 조회</p>
                            {detail.searches.length === 0 ? (
                              <p className="udetail__empty">아직 없습니다.</p>
                            ) : (
                              <ul className="udetail__days">
                                {detail.searches.map((d) => (
                                  <li key={d.day}>
                                    <span className="num">{d.day}</span>
                                    <span className="num">{d.count}회</span>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {/*
                              저장한 장소는 **개수만** 보여준다. "집" 이라고 저장한 좌표는
                              그 사람이 사는 곳이고, 승인을 정하거나 문의에 답하는 데 그게
                              필요한 적은 없다. 볼 수 있게 해두면 언젠가 보게 된다.
                            */}
                            <p className="udetail__note">
                              저장한 장소 {detail.places}곳 — 주소는 관리자에게도 보이지 않습니다
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
            </>
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
