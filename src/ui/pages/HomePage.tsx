import { useState } from 'react'
import { resolveWhen } from '../../parse/parse'
import { hasMockAdapters } from '../../adapters/registry'
import { diffMin, formatClock, humanDuration } from '../../engine/time'
import { dictionaries } from '../../i18n'
import { planTrip, type PlanOutcome, type RouteOption } from '../planTrip'
import { describeRoute } from '../../engine/rank'
import { usePrefs } from '../PrefsContext'
import { deriveWarnings } from '../deriveWarnings'
import { SearchPanel, type QueryInput } from '../components/SearchPanel'
import { SiteHeader } from '../components/SiteHeader'
import { HowItWorks } from '../components/HowItWorks'
import { SiteFooter } from '../components/SiteFooter'
import { MockBanner } from '../components/MockBanner'
import { DataGap } from '../components/DataGap'
import { TripSpine } from '../components/TripSpine'
import { Warnings } from '../components/Warnings'
import { Countdown } from '../components/Countdown'
import { Alternatives } from '../components/Alternatives'
import { Hero } from '../components/Hero'
import { JourneyMap } from '../components/JourneyMap'
import { SetupNotice } from '../components/SetupNotice'

const EXAMPLES: { label: string; query: QueryInput }[] = [
  { label: '부산 11시까지', query: { mode: 'arriveBy', from: '집', to: '부산', when: '11:00' } },
  { label: '지금 나가면 부산 언제?', query: { mode: 'departNow', from: '집', to: '부산', when: null } },
]

export function HomePage() {
  const { lang } = usePrefs()
  const t = dictionaries[lang]
  const UNIT = { h: t.units.hour, m: t.units.minute }
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null)
  const [lastQuery, setLastQuery] = useState<QueryInput | null>(null)
  const [shown, setShown] = useState<RouteOption | null>(null)
  const [now, setNow] = useState(() => new Date())

  async function run(query: QueryInput) {
    setLastQuery(query)
    setPending(true)
    const at = new Date()
    setNow(at)

    // "HH:mm" 도 "11시" 도 같은 함수가 오늘/내일 기준 Date 로 바꾼다
    const target = resolveWhen(query.when, at) ?? new Date(at.getTime() + 3 * 60 * 60_000)

    const result = await planTrip(
      {
        from: { name: query.from || '집' },
        to: { name: query.to },
        around: at,
        fromCountry: 'KR',
        toCountry: 'KR',
      },
      query.mode,
      target,
      at,
    )

    setOutcome(result)
    setShown(result.kind === 'trip' ? result.chosen : null)
    setPending(false)
  }

  function selectRoute(option: RouteOption) {
    setShown(option)
  }

  const clock = (d: Date) => formatClock(d, now, t.clock)

  const hasResult = outcome !== null

  return (
    <div className="page">
      <SiteHeader t={t} solid={hasResult} />

      <Hero t={t} compact={hasResult}>
        <SearchPanel t={t} onSubmit={run} pending={pending} />
      </Hero>

      <div className="shell">
        {hasMockAdapters() && <MockBanner t={t} />}
        <SetupNotice />

        {outcome?.kind === 'gap' && (
          <DataGap
            failure={outcome.failure}
            t={t}
            onRetry={lastQuery ? () => run(lastQuery) : undefined}
          />
        )}

        {outcome?.kind === 'no-route' && (
          <div className="notice notice--bad" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{t.warning['no-solution']}</span>
          </div>
        )}

        {!outcome && (
          <section className="empty">
            <p className="empty__label">{t.empty.examples}</p>
            <div className="empty__chips">
              {EXAMPLES.map((e) => (
                <button key={e.label} className="example" type="button" onClick={() => run(e.query)}>
                  {e.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {outcome?.kind === 'trip' && shown && (
          <>
            <section className="verdict">
              <div className="verdict__main">
                <p className="verdict__depart">{t.result.departAt(clock(shown.legs[0].departAt))}</p>
                <p className="verdict__arrive">
                  {t.result.arriveAt(clock(shown.legs[shown.legs.length - 1].arriveAt))}
                  <span className="verdict__sep">·</span>
                  {t.result.totalDuration(
                    humanDuration(
                      diffMin(shown.legs[shown.legs.length - 1].arriveAt, shown.legs[0].departAt),
                      UNIT,
                    ),
                  )}
                </p>
                {shown.rung === outcome.chosen.rung ? (
                  <p className="verdict__tag">{t.route.chosen[outcome.reason]}</p>
                ) : (
                  <p className="verdict__tag verdict__tag--alt">
                    {describeRoute(shown.legs).carrier ?? t.route.unnamed}
                  </p>
                )}
              </div>
              <Countdown departAt={shown.legs[0].departAt} t={t} />
            </section>

            {outcome.renegotiated && (
              <div className="notice notice--warn" role="status">
                <span aria-hidden="true">↻</span>
                <span>{t.result.renegotiated(clock(outcome.target))}</span>
              </div>
            )}

            <Warnings warnings={deriveWarnings(shown.legs, now, shown.legs[0].departAt)} t={t} />

            <div className="columns">
              <section className="col col--main">
                <h2 className="col__label">{t.sections.journey}</h2>
                <TripSpine legs={shown.legs} now={now} t={t} />
              </section>

              <aside className="col col--side">
                <JourneyMap legs={shown.legs} country="KR" t={t} />
                <Alternatives
                  items={outcome.others}
                  baselineArrival={outcome.chosen.arriveAt}
                  now={now}
                  t={t}
                  onSelect={selectRoute}
                  selectedRung={shown.rung}
                />
              </aside>
            </div>
          </>
        )}
      </div>

      {!hasResult && <HowItWorks t={t} />}
      <SiteFooter t={t} />
    </div>
  )
}
