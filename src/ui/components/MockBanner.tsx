import type { I18nShape } from '../../i18n'

/** 목업 데이터로 계산된 결과 위에 항상 붙는다. registry.hasMockAdapters()가 참일 때만 렌더. */
export function MockBanner({ t }: { t: I18nShape }) {
  return (
    <div className="banner banner--mock" role="status">
      <span className="banner__icon" aria-hidden="true">
        MOCK
      </span>
      <div className="banner__body">
        <span>{t.mockBanner}</span>
      </div>
    </div>
  )
}
