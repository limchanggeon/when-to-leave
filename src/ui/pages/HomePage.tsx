import { useEffect, useState } from 'react'
import { resolveWhen } from '../../parse/parse'
import { diffMin, formatClock, humanDuration } from '../../engine/time'
import { dictionaries } from '../../i18n'
import { planTrip, type PlanOutcome, type RouteOption } from '../planTrip'
import { describeRoute } from '../../engine/rank'
import { getLastResolved } from '../../adapters/live/koreaLive'
import { usePrefs } from '../PrefsContext'
import { deriveWarnings } from '../deriveWarnings'
import { SearchPanel, type QueryInput } from '../components/SearchPanel'
import { SiteHeader } from '../components/SiteHeader'
import { HowItWorks } from '../components/HowItWorks'
import { SiteFooter } from '../components/SiteFooter'
import { DataGap } from '../components/DataGap'
import { TripSpine } from '../components/TripSpine'
import { Warnings } from '../components/Warnings'
import { Countdown } from '../components/Countdown'
import { Alternatives } from '../components/Alternatives'
import { AddToCalendar } from '../components/AddToCalendar'
import { ResultSkeleton } from '../components/ResultSkeleton'
import { TripStats } from '../components/TripStats'
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
  /** 여정에서 짚은 구간 — 지도와 공유한다. */
  const [hovered, setHovered] = useState<number | null>(null)

  async function run(query: QueryInput) {
    setLastQuery(query)
    setPending(true)
    const at = new Date()
    setNow(at)

    // "HH:mm" 도 "11시" 도 같은 함수가 오늘/내일 기준 Date 로 바꾼다.
    // 시각이 없으면 departNow 로 오므로 target 은 쓰이지 않는다 —
    // 임의의 시각을 지어내는 대신 현재 시각을 넣어 둔다.
    const target = resolveWhen(query.when, at) ?? at

    const result = await planTrip(
      {
        // 좌표가 있으면 함께 넘긴다 — 지도와 경로 계산 모두 지명보다 좌표가 정확하다.
        // 좌표도 이름도 없으면 지어내지 않는다. 예전에는 '집' 으로 채워 넣었는데
        // 서버가 그 글자를 그대로 검색해 엉뚱한 곳을 출발지로 잡았다.
        from: {
          name: query.from,
          lat: query.fromCoords?.lat,
          lng: query.fromCoords?.lng,
        },
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

  /*
   * 탭을 다른 곳으로 옮겨도 남은 시간이 보이게 한다.
   * 출발을 기다리는 동안 이 앱을 계속 보고 있을 이유가 없다.
   */
  useEffect(() => {
    if (!shown) {
      document.title = t.app.title
      return
    }
    const update = () => {
      const left = diffMin(shown.legs[0].departAt, new Date())
      document.title =
        left >= 0
          ? `${humanDuration(left, UNIT)} 후 출발 · ${t.app.title}`
          : `${t.result.leaveNow} · ${t.app.title}`
    }
    update()
    const id = setInterval(update, 30_000)
    return () => {
      clearInterval(id)
      document.title = t.app.title
    }
  }, [shown, t])
  const resolved = outcome?.kind === 'trip' ? getLastResolved() : null

  const hasResult = outcome !== null

  return (
    <div className="page">
      <SiteHeader t={t} solid={hasResult} />

      <Hero t={t} compact={hasResult}>
        <SearchPanel t={t} onSubmit={run} pending={pending} />
      </Hero>

      <div className="shell">
        <SetupNotice />

        {pending && <ResultSkeleton />}

        {!pending && outcome?.kind === 'gap' && (
          <DataGap
            failure={outcome.failure}
            t={t}
            onRetry={lastQuery ? () => run(lastQuery) : undefined}
          />
        )}

        {!pending && outcome?.kind === 'no-route' && (
          <div className="notice notice--bad" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{t.warning['no-solution']}</span>
          </div>
        )}

        {!outcome && !pending && (
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

        {!pending && outcome?.kind === 'trip' && shown && (
          <>
            <section className="verdict">
              <div className="verdict__main">
                <p className="verdict__depart">{t.result.departAt(clock(shown.legs[0].departAt))}</p>
                {/* 서버가 무엇으로 해석했는지 보여준다. "집" 같은 말이
                    엉뚱한 가게로 잡혀도 여기서 바로 눈에 띈다. */}
                {resolved && (
                  <p className="verdict__resolved">
                    {t.result.resolvedAs(resolved.from.name, resolved.to.name)}
                  </p>
                )}
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

            <TripStats legs={shown.legs} t={t} />

            <AddToCalendar legs={shown.legs} now={now} t={t} />

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
                <TripSpine
                  legs={shown.legs}
                  now={now}
                  t={t}
                  onHover={setHovered}
                  active={hovered}
                />
              </section>

              <div className="col col--map">
                <JourneyMap legs={shown.legs} country="KR" t={t} highlight={hovered} />
              </div>

              <aside className="col col--rail">
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
