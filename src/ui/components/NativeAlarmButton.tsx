import { useRef, useState } from 'react'
import { androidClockProvider } from '../../alarm/nativeProviders'
import { clockTime } from '../../alarm/clockTime'
import type { Leg } from '../../engine/types'
import type { I18nShape } from '../../i18n'

export function NativeAlarmButton({ legs, now, t }: { legs: Leg[]; now: Date; t: I18nShape }) {
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const at = legs[0].departAt
  const invalid = clockTime(at, now)
  async function add() {
    if (inFlight.current) return
    const problem = clockTime(at)
    if (problem) { setError(problem === 'past' ? t.alarm.nativePast : t.alarm.nativeDate); return }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const r = await androidClockProvider.schedule({ at, title: t.alarm.title(legs[legs.length - 1].to.name), body: '' })
      if (r.ok) setOpened(true)
      else setError(r.failure.message)
    } finally { setBusy(false); inFlight.current = false }
  }
  return <div className="calendar">
    <button type="button" className="btn" disabled={busy || !!invalid} onClick={add}>
      {busy ? t.alarm.adding : `🔔 ${t.alarm.nativeAdd}`}
    </button>
    <p className="calendar__hint" role="status">{invalid === 'past' ? t.alarm.nativePast
      : invalid === 'date' ? t.alarm.nativeDate : opened ? t.alarm.nativeOpened : t.alarm.nativeHint}</p>
    {error && <p className="calendar__error" role="alert">{error}</p>}
  </div>
}
