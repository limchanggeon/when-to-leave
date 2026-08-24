import type { Warning } from '../../engine/types'
import type { I18nShape } from '../../i18n'

export function Warnings({ warnings, t }: { warnings: Warning[]; t: I18nShape }) {
  if (warnings.length === 0) return null
  return (
    <div className="warnings">
      {warnings.map((w, i) => (
        <div className="warning" key={i} role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{t.warning[w.code]}</span>
        </div>
      ))}
    </div>
  )
}
