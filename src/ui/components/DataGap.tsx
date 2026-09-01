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
  /*
   * 지역 미지원은 어댑터 이름을 말해봐야 소용없다 —
   * 사용자가 할 수 있는 일이 없는 상태이므로 사실만 알린다.
   * 서버 문구는 한국어라, 화면 언어에 맞는 문장을 여기서 고른다.
   */
  const message =
    failure.code === 'region-unsupported'
      ? t.dataGap['region-unsupported']
      : t.dataGap[failure.code](failure.adapter)
  return (
    <div className="banner banner--gap" role="alert">
      <span className="banner__icon" aria-hidden="true">
        ⚠
      </span>
      <div className="banner__body">
        <span className="banner__title">{t.dataGap.title}</span>
        <span>{message}</span>
        {/*
          서버 문구는 한국어라 그대로 띄우면 일본어 화면에 한국어가 섞인다.
          사용자에게 필요한 말은 위 message 가 이미 담고 있으므로,
          detail 은 손쓸 거리가 있는 기술 오류에만 보여준다.
        */}
        {failure.detail && (failure.code === 'upstream-error' || failure.code === 'network') && (
          <span className="banner__detail">{failure.detail}</span>
        )}
        {onRetry && (
          <button className="banner__retry" onClick={onRetry} type="button">
            {t.dataGap.retry}
          </button>
        )}
      </div>
    </div>
  )
}
