import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dictionaries } from '../../i18n'
import { usePrefs } from '../PrefsContext'
import { SiteHeader } from '../components/SiteHeader'

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
interface Overview {
  stats: Record<string, number>
  users: AdminUser[]
  log: { id: number; actorEmail: string; action: string; targetEmail: string | null; detail: string | null; createdAt: number }[]
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

  async function load() {
    const res = await fetch('/api/admin/overview', { credentials: 'include' })
    if (!res.ok) {
      setError(res.status === 404 ? '없는 주소입니다' : '불러오지 못했습니다')
      return
    }
    setData((await res.json()) as Overview)
    setError(null)
  }
  useEffect(() => {
    void load()
  }, [])

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

  return (
    <div className="page">
      <SiteHeader t={t} solid />
      <div className="shell">
        <Link className="mypage__back" to="/">
          ← 홈으로
        </Link>
        <h1 className="mypage__title">관리자</h1>

        {error && (
          <div className="notice notice--bad" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {data && (
          <>
            <section className="card">
              <h2 className="card__title">한눈에</h2>
              <dl className="stats stats--paper">
                {Object.entries(data.stats).map(([k, v]) => (
                  <div className="stats__item" key={k}>
                    <dt>{STAT_LABEL[k] ?? k}</dt>
                    <dd className="num">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="card">
              <h2 className="card__title">계정 {data.users.length}개</h2>
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
                          <span className="chip chip--muted" key={p}>
                            {p}
                          </span>
                        ))}
                      </span>
                      <span className="adminrow__meta num">
                        가입 {when(u.createdAt)} · 장소 {u.places} · 로그인 중 {u.sessions}
                      </span>
                    </div>
                    <div className="adminrow__acts">
                      {!u.emailVerified && (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busy === u.id}
                          onClick={() => act(u, '/verify', { method: 'POST' })}
                        >
                          확인 처리
                        </button>
                      )}
                      {u.sessions > 0 && (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busy === u.id}
                          onClick={() =>
                            act(u, '/revoke-sessions', { method: 'POST' }, `${u.email} 의 로그인을 전부 끊을까요?`)
                          }
                        >
                          세션 끊기
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busy === u.id}
                        onClick={() =>
                          act(
                            u,
                            '/admin',
                            { method: 'POST', body: JSON.stringify({ on: !u.isAdmin }) },
                            u.isAdmin ? `${u.email} 을 관리자에서 내릴까요?` : `${u.email} 을 관리자로 세울까요?`,
                          )
                        }
                      >
                        {u.isAdmin ? '관리자 내리기' : '관리자 세우기'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        disabled={busy === u.id}
                        onClick={() =>
                          act(
                            u,
                            '',
                            { method: 'DELETE' },
                            `${u.email} 계정을 지웁니다. 저장한 장소와 연동도 함께 사라지고 되돌릴 수 없습니다. 계속할까요?`,
                          )
                        }
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 className="card__title">관리 기록</h2>
              <p className="card__hint">누가 언제 무엇을 했는지. 대상이 지워져도 남는다.</p>
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
          </>
        )}
      </div>
    </div>
  )
}
