import { platform } from '../../native/platform'
import { NativeAlarmButton } from './NativeAlarmButton'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { calendarProvider, connectCalendar } from '../../alarm/calendarProvider'
import { useAuthContext } from '../../auth/AuthContext'
import { formatClock, humanDuration } from '../../engine/time'
import type { Leg } from '../../engine/types'
import type { I18nShape } from '../../i18n'

type State =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done'; link?: string }
  | { phase: 'needs-connect' }
  | { phase: 'error'; message: string }

/** 여정을 구글 캘린더 일정으로 만든다. 출발 시각에 알림이 울린다. */
function CalendarButton({
  legs,
  now,
  t,
}: {
  legs: Leg[]
  now: Date
  t: I18nShape
}) {
  const { account } = useAuthContext()
  const [state, setState] = useState<State>({ phase: 'idle' })

  if (!account) {
    return (
      <p className="calendar__hint">
        <Link to="/login">{t.alarm.needLogin}</Link>
      </p>
    )
  }

  const departAt = legs[0].departAt
  const arriveAt = legs[legs.length - 1].arriveAt
  const unit = { h: t.units.hour, m: t.units.minute }
  const clock = (d: Date) => formatClock(d, now, t.clock)

  async function add() {
    setState({ phase: 'working' })

    // 여정을 그대로 본문에 담는다 — 캘린더가 곧 여정 저장소가 된다
    const summary = legs
      .map((l) => {
        const ride = [t.leg[l.kind], l.carrier].filter(Boolean).join(' ')
        return `${clock(l.departAt)}  ${l.from.name} — ${ride} ${humanDuration(
          Math.round((l.arriveAt.getTime() - l.departAt.getTime()) / 60000),
          unit,
        )}`
      })
      .concat(`${clock(arriveAt)}  ${legs[legs.length - 1].to.name}`)
      .join('\n')

    const r = await calendarProvider.schedule({
      at: departAt,
      until: arriveAt,
      title: t.alarm.title(legs[legs.length - 1].to.name),
      body: t.alarm.body(clock(departAt), clock(arriveAt), summary),
      location: legs[0].from.name,
      remindBeforeMin: [15, 5],
    })

    if (r.ok) setState({ phase: 'done', link: r.link })
    else if (r.failure.code === 'not-connected') setState({ phase: 'needs-connect' })
    else setState({ phase: 'error', message: r.failure.message })
  }

  async function connect() {
    const url = await connectCalendar()
    if (url) window.location.href = url
    else setState({ phase: 'error', message: t.alarm.connect })
  }

  if (state.phase === 'done') {
    return (
      <p className="calendar__done">
        ✓ {t.alarm.added}
        {state.link && (
          <a href={state.link} target="_blank" rel="noreferrer">
            {t.alarm.open} ↗
          </a>
        )}
      </p>
    )
  }

  if (state.phase === 'needs-connect') {
    return (
      <div className="calendar__connect">
        <p>{t.alarm.connectHint}</p>
        <button className="btn" type="button" onClick={connect}>
          {t.alarm.connect}
        </button>
      </div>
    )
  }

  return (
    <div className="calendar">
      <button className="btn" type="button" onClick={add} disabled={state.phase === 'working'}>
        {state.phase === 'working' ? t.alarm.adding : `🔔 ${t.alarm.add}`}
      </button>
      {state.phase === 'error' && <p className="calendar__error">{state.message}</p>}
    </div>
  )
}

/** Android에서는 로그인이나 캘린더 연결 없이 기기 알람을 설정한다. */
export function AddToCalendar(props: { legs: Leg[]; now: Date; t: I18nShape }) {
  if (!props.legs.length) return null
  return platform() === 'android'
    ? <NativeAlarmButton key={`${props.legs[0].departAt.getTime()}:${props.legs.at(-1)?.to.name}`} {...props} />
    : <CalendarButton {...props} />
}
