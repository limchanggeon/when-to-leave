import type { Failure } from '../../adapters/types'
import type { I18nShape } from '../../i18n'

/**
 * "데이터가 안 들어왔다"를 사용자에게 그대로 보여준다.
 * 절대 조용히 빈 화면을 내지 않는다 — 요청하신 요건이 이 컴포넌트 하나로 지켜진다.
 */
export function DataGap({
  failure,
  t,
  onRetry,
}: {
  failure: Failure
  t: I18nShape
  onRetry?: () => void
}) {
  const message = t.dataGap[failure.code](failure.adapter)
  return (
    <div className="banner banner--gap" role="alert">
      <span className="banner__icon" aria-hidden="true">
        ⚠
      </span>
      <div className="banner__body">
        <span className="banner__title">{t.dataGap.title}</span>
        <span>{message}</span>
        {failure.detail && <span className="banner__detail">{failure.detail}</span>}
        {onRetry && (
          <button className="banner__retry" onClick={onRetry} type="button">
            {t.dataGap.retry}
          </button>
        )}
      </div>
    </div>
  )
}
