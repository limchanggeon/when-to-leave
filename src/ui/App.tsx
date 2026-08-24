import { useState } from 'react'
import { parseUtterance, resolveWhen } from '../parse/parse'
import { resolveRoute, hasMockAdapters } from '../adapters/registry'
import type { Failure } from '../adapters/types'
import { solveBackward, solveForward } from '../engine/schedule'
import { DEFAULT_POLICY } from '../engine/buffer'
import { hhmm, humanDuration, diffMin } from '../engine/time'
import type { Leg } from '../engine/types'
import { dictionaries, type Lang } from '../i18n'
import { deriveWarnings } from './deriveWarnings'
import { SearchBar } from './components/SearchBar'
import { MockBanner } from './components/MockBanner'
import { DataGap } from './components/DataGap'
import { TripSpine } from './components/TripSpine'
import { Warnings } from './components/Warnings'

type Result =
  | { kind: 'idle' }
  | { kind: 'gap'; failure: Failure }
  | { kind: 'no-route' }
  | { kind: 'trip'; legs: Leg[]; departAt: Date; arriveAt: Date }

export default function App() {
  const [lang] = useState<Lang>('ko')
  const t = dictionaries[lang]
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result>({ kind: 'idle' })
  const [lastQuery, setLastQuery] = useState<string | null>(null)

  async function run(text: string) {
    setLastQuery(text)
    setPending(true)
    const now = new Date()
    const intent = parseUtterance(text)
    const when = resolveWhen(intent.when, now) ?? new Date(now.getTime() + 3 * 60 * 60_000)

    const req = {
      from: { name: intent.from ?? '집' },
      to: { name: intent.to ?? '' },
      around: now,
      fromCountry: 'KR' as const,
      toCountry: 'KR' as const,
    }

    const routed = await resolveRoute(req)
    if (!routed.ok) {
      setResult({ kind: 'gap', failure: routed.failure })
      setPending(false)
      return
    }

    const solved =
      intent.mode === 'arriveBy'
        ? solveBackward(routed.data, when, DEFAULT_POLICY)
        : solveForward(routed.data, now, DEFAULT_POLICY)

    if (!solved.ok) {
      setResult({ kind: 'no-route' })
      setPending(false)
      return
    }

    const legs = solved.legs
    setResult({
      kind: 'trip',
      legs,
      departAt: legs[0].departAt,
      arriveAt: legs[legs.length - 1].arriveAt,
    })
    setPending(false)
  }

  const now = new Date()

  return (
    <div className="shell">
      <header className="header">
        <h1 className="header__title">{t.app.title}</h1>
        <p className="header__tagline">{t.app.tagline}</p>
      </header>

      {hasMockAdapters() && <MockBanner t={t} />}

      <SearchBar t={t} onSubmit={run} pending={pending} />

      {result.kind === 'gap' && (
        <DataGap failure={result.failure} t={t} onRetry={lastQuery ? () => run(lastQuery) : undefined} />
      )}

      {result.kind === 'no-route' && (
        <div className="warning" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{t.warning['no-solution']}</span>
        </div>
      )}

      {result.kind === 'trip' && (
        <>
          <section className="result-head">
            <p className="result-head__depart">{t.result.departAt(hhmm(result.departAt))}</p>
            <div className="result-head__meta">
              <span>{t.result.arriveAt(hhmm(result.arriveAt))}</span>
              <span>{t.result.leaveIn(humanDuration(diffMin(result.departAt, now), { h: '시간', m: '분' }))}</span>
            </div>
          </section>

          <Warnings warnings={deriveWarnings(result.legs, now, result.departAt)} t={t} />

          <section>
            <p className="section-label">여정</p>
            <TripSpine legs={result.legs} t={t} />
          </section>
        </>
      )}
    </div>
  )
}
