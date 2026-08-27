import { missingConfig } from '../../config'

/**
 * 아직 안 붙은 외부 서비스를 한 줄로 알려준다.
 * 키가 없다는 사실을 콘솔에만 남기면 왜 안 되는지 알 수 없다.
 */
export function SetupNotice() {
  const missing = missingConfig()
  if (missing.length === 0) return null

  return (
    <details className="setup">
      <summary className="setup__summary">
        연결되지 않은 서비스 {missing.length}개 — 지도·로그인을 쓰려면 키가 필요합니다
      </summary>
      <ul className="setup__list">
        {missing.map((m) => (
          <li key={m.envVar}>
            <span className="setup__service">{m.service}</span>
            <code className="setup__env">{m.envVar}</code>
            <a className="setup__link" href={m.docsUrl} target="_blank" rel="noreferrer">
              키 발급 →
            </a>
          </li>
        ))}
      </ul>
      <p className="setup__hint">
        <code>.env.example</code> 를 <code>.env</code> 로 복사해 값을 채운 뒤 서버를 다시 시작하세요.
      </p>
    </details>
  )
}
