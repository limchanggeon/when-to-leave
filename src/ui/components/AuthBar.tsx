import { providers, useAuth } from '../../auth/useAuth'
import type { AuthFailure } from '../../auth/types'

function failureText(f: AuthFailure): string {
  switch (f.code) {
    case 'not-configured':
      return `${f.envVar} 가 .env 에 없습니다 — 키를 넣으면 바로 동작합니다`
    case 'cancelled':
      return '로그인을 취소했습니다'
    case 'sdk-unavailable':
      return 'SDK를 불러오지 못했습니다 (네트워크 또는 도메인 등록 확인)'
    case 'failed':
      return f.detail ?? '로그인에 실패했습니다'
  }
}

/** 로그인 상태 표시 + 카카오/구글 로그인 버튼. */
export function AuthBar() {
  const { account, failure, busy, signIn, signOut } = useAuth()

  if (account) {
    return (
      <div className="authbar">
        {account.avatarUrl && <img className="authbar__avatar" src={account.avatarUrl} alt="" />}
        <span className="authbar__name">{account.name ?? account.email ?? '로그인됨'}</span>
        <button className="authbar__btn authbar__btn--ghost" type="button" onClick={signOut}>
          로그아웃
        </button>
      </div>
    )
  }

  return (
    <div className="authbar">
      {providers.map((p) => (
        <button
          key={p.id}
          className={`authbar__btn authbar__btn--${p.id}`}
          type="button"
          onClick={() => signIn(p.id)}
          disabled={busy !== null}
          // 키가 없어도 눌러볼 수 있게 둔다 — 왜 안 되는지 안내가 떠야 하니까
          title={p.configured ? p.label : '키가 설정되지 않았습니다'}
        >
          {busy === p.id ? '…' : p.label}
          {!p.configured && <span className="authbar__dot" aria-label="설정 필요" />}
        </button>
      ))}
      {failure && <p className="authbar__error">{failureText(failure)}</p>}
    </div>
  )
}
