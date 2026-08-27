import { Link } from 'react-router-dom'
import { useAuthContext } from '../../auth/AuthContext'

/** 상단바. 로그인 자체는 /login 페이지에서 한다. */
export function AuthBar() {
  const { account, signOut } = useAuthContext()

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
      <Link className="authbar__btn authbar__btn--solid" to="/login">
        로그인
      </Link>
    </div>
  )
}
