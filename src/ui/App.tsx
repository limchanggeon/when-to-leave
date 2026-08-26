import { useState } from 'react'
import { parseUtterance, resolveWhen } from '../parse/parse'
import { hasMockAdapters } from '../adapters/registry'
import { diffMin, formatClock, humanDuration } from '../engine/time'
import type { Leg } from '../engine/types'
import { dictionaries, type Lang } from '../i18n'
import { planTrip, type PlanOutcome } from './planTrip'
import { deriveWarnings } from './deriveWarnings'
import { SearchBar } from './components/SearchBar'
import { MockBanner } from './components/MockBanner'
import { DataGap } from './components/DataGap'
import { TripSpine } from './components/TripSpine'
import { Warnings } from './components/Warnings'
import { Countdown } from './components/Countdown'
import { Alternatives, type AlternativeView } from './components/Alternatives'

const EXAMPLES = ['수서에서 부산 11시까지', '지금 나가면 부산 몇시 도착?']
const UNIT = { h: '시간', m: '분' }

export default function App() {
  const [lang] = useState<Lang>('ko')
  const t = dictionaries[lang]
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null)
  const [lastQuery, setLastQuery] = useState<string | null>(null)
  const [shown, setShown] = useState<{ legs: Leg[]; label?: string } | null>(null)
  const [now, setNow] = useState(() => new Date())

  async function run(text: string) {
    setLastQuery(text)
    setPending(true)
    const at = new Date()
    setNow(at)

    const intent = parseUtterance(text)
    const target = resolveWhen(intent.when, at) ?? new Date(at.getTime() + 3 * 60 * 60_000)

    const result = await planTrip(
      {
        from: { name: intent.from ?? '집' },
        to: { name: intent.to ?? '' },
        around: at,
        fromCountry: 'KR',
        toCountry: 'KR',
      },
      intent.mode,
      target,
      at,
    )

    setOutcome(result)
    setShown(result.kind === 'trip' ? { legs: result.legs } : null)
    setPending(false)
  }

  function selectAlternative(a: AlternativeView) {
    setShown({ legs: a.legs, label: t.fallback[a.labelKey] ?? a.labelKey })
  }

  const clock = (d: Date) => formatClock(d, now, t.clock)

  return (
    <div className="page">
      <div className="shell">
        <header className="masthead">
          <h1 className="masthead__title">{t.app.title}</h1>
          <p className="masthead__tagline">{t.app.tagline}</p>
        </header>

        {hasMockAdapters() && <MockBanner t={t} />}

        <SearchBar t={t} onSubmit={run} pending={pending} examples={EXAMPLES} />

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
            <h2 className="empty__title">{t.empty.title}</h2>
            <p className="empty__body">{t.empty.body}</p>
            <p className="empty__label">{t.empty.examples}</p>
            <div className="empty__chips">
              {EXAMPLES.map((e) => (
                <button key={e} className="example" type="button" onClick={() => run(e)}>
                  {e}
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
                {shown.label && <p className="verdict__tag">{shown.label}</p>}
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
                <h2 className="col__label">여정</h2>
                <TripSpine legs={shown.legs} now={now} t={t} />
              </section>

              <aside className="col col--side">
                <Alternatives
                  items={outcome.alternatives}
                  baselineArrival={outcome.legs[outcome.legs.length - 1].arriveAt}
                  now={now}
                  t={t}
                  onSelect={selectAlternative}
                />
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
