import { useEffect, useState } from 'react'
import { resolveWhen } from '../../parse/parse'
import { dayOffset, diffMin, formatClock, hhmm, humanDuration } from '../../engine/time'
import { dictionaries, type I18nShape } from '../../i18n'
import { planTrip, type PlanOutcome, type RouteOption } from '../planTrip'
import { describeRoute } from '../../engine/rank'
import { getLastResolved } from '../../adapters/live/koreaLive'
import { usePrefs } from '../PrefsContext'
import { deriveWarnings } from '../deriveWarnings'
import { SearchPanel, type OriginState, type QueryInput } from '../components/SearchPanel'
import { SiteHeader } from '../components/SiteHeader'
import { HowItWorks } from '../components/HowItWorks'
import { SiteFooter } from '../components/SiteFooter'
import { SignUpWall } from '../components/SignUpWall'
import { QuotaWall } from '../components/QuotaWall'
import { markFreeSearchUsed, usedUpFreeSearch } from '../freeSearch'
import { rememberSearch, takeSearch } from '../pendingSearch'
import { refreshQuota } from '../quota'
import { useAuthContext } from '../../auth/AuthContext'
import { DataGap } from '../components/DataGap'
import { TripSpine } from '../components/TripSpine'
import { Warnings } from '../components/Warnings'
import { Countdown } from '../components/Countdown'
import { Alternatives } from '../components/Alternatives'
import { AddToCalendar } from '../components/AddToCalendar'
import { ResultSkeleton } from '../components/ResultSkeleton'
import { TripStats } from '../components/TripStats'
import { QuickRoutes } from '../components/QuickRoutes'
import { fetchMe, type SavedPlace } from '../../auth/me'
import { Hero } from '../components/Hero'
import { JourneyMap } from '../components/JourneyMap'
import { SetupNotice } from '../components/SetupNotice'
import { Tour } from '../components/Tour'

/**
 * 판에 거는 날짜 딱지.
 *
 * formatClock 은 "내일 10:59" 한 덩어리로 주는데, 판에서는 숫자만 크게 걸고
 * 날짜는 작은 딱지로 옆에 둬야 한다 — 호박색 숫자 안에 한글이 섞이면
 * 제일 커야 할 것이 시각이 아니라 문장이 된다.
 */
function dayTag(d: Date, base: Date, c: I18nShape['clock']): string | null {
  const off = dayOffset(d, base)
  if (off === 0) return null
  if (off === 1) return c.tomorrow
  if (off === 2) return c.dayAfter
  return c.nDays(off)
}

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
  /** 저장한 장소 — 맨 윗줄 바로가기에 쓴다. */
  const [places, setPlaces] = useState<SavedPlace[]>([])
  /**
   * 출발지. 검색 패널과 맨 윗줄 바로가기가 같이 쓴다 —
   * 패널 안에 두면 바로가기가 빈 출발지로 검색을 보낸다.
   */
  const [origin, setOrigin] = useState<OriginState>({ name: '', geoName: null })
  /**
   * 답이 걸린 뒤에도 질의를 펼쳐 둘지.
   * 답이 없을 때는 이 값과 무관하게 늘 펼쳐진다 — 홈은 검색하는 자리다.
   */
  const [queryOpen, setQueryOpen] = useState(false)
  /**
   * 홈으로 되돌린 횟수. 검색 패널의 key 로 써서 입력칸까지 비운다 —
   * 목적지·도착 시각은 그 컴포넌트 안에 있어서 바깥 상태만 지워서는 안 지워진다.
   * 출발지는 여기(HomePage)가 들고 있으므로 살아남는다. 되돌릴 때마다 위치를
   * 다시 잡게 만들 이유가 없다.
   */
  const [resetKey, setResetKey] = useState(0)
  const [tour, setTour] = useState(false)
  /** 무료 조회를 다 쓴 사람에게 보이는 창. */
  const [wall, setWall] = useState(false)
  /** 하루 한도를 다 쓴 회원에게 보이는 창. 다 쓴 한도 값을 함께 들고 있는다. */
  const [quotaWall, setQuotaWall] = useState<number | null>(null)
  const { account } = useAuthContext()
  /**
   * 메일 링크를 누르고 돌아온 결과. 서버가 /?verify=... 로 보내준다.
   *
   * 읽고 나면 주소에서 지운다 — 새로고침할 때마다 같은 알림이 다시 뜨거나,
   * 그 주소를 남에게 복사해 보내는 걸 막는다.
   */
  const [verifyNotice] = useState<keyof I18nShape['verifyNotice'] | null>(() => {
    if (typeof window === 'undefined') return null
    const v = new URLSearchParams(window.location.search).get('verify')
    if (!v) return null
    window.history.replaceState({}, '', window.location.pathname)
    return v === 'unknown' ? 'invalid' : (v as keyof I18nShape['verifyNotice'])
  })

  /*
   * 로그인하고 돌아왔으면 하려던 조회를 대신 마쳐준다.
   *
   * 담에 막혀 로그인한 사람에게 "이제 처음부터 다시 입력하세요" 라고 하면
   * 흐름을 끊은 값을 못 받는다. takeSearch 는 꺼내면서 지우므로 한 번만
   * 이어준다 — 새로고침마다 다시 돌면 안 된다.
   */
  useEffect(() => {
    if (!account) return
    const pending = takeSearch()
    if (pending) void run(pending)
    // run 은 이 화면의 상태를 쓰므로 의존성에 넣지 않는다. 로그인 순간 한 번이면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  useEffect(() => {
    let cancelled = false
    fetchMe().then((r) => {
      if (!cancelled && r.ok) setPlaces(r.data.places)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function run(query: QueryInput) {
    /*
     * 무료 조회를 다 썼으면 **계산하기 전에** 멈춘다.
     *
     * 결과를 만들어 놓고 덮으면 볼 수 없는 답을 위해 카카오·TAGO 를 부르는
     * 셈이고, 사람은 몇 초 기다린 끝에 담을 만난다. 누르는 즉시 권한다.
     */
    if (!account && usedUpFreeSearch()) {
      // 로그인하고 돌아오면 이 조회를 대신 마쳐준다
      rememberSearch(query)
      setWall(true)
      return
    }

    setLastQuery(query)
    setPending(true)
    // 계산을 시켰으면 다음으로 볼 것은 여정이다. 폼은 접어서 자리를 내준다.
    setQueryOpen(false)
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

    /*
     * 서버가 한도를 넘었다고 하면 결과 대신 창을 띄운다.
     * 화면에서 미리 막지 않고 서버 답을 기다리는 이유는, 한도가 서버에만
     * 있기 때문이다 — 브라우저가 세면 저장소를 비워 넘길 수 있다.
     */
    // 한 번 썼든 막혔든 남은 수가 달라졌을 수 있다 — 헤더를 다시 읽게 한다
    if (account) void refreshQuota()

    if (result.kind === 'gap' && result.failure.code === 'quota-exceeded') {
      setQuotaWall(result.failure.limit ?? 3)
      setPending(false)
      return
    }

    setOutcome(result)
    setShown(result.kind === 'trip' ? result.chosen : null)
    setPending(false)

    /*
     * 답이 나왔을 때만 센다. 경로를 못 찾았는데 무료 한 번을 썼다고 하면
     * 받은 것 없이 담부터 만나는 셈이다.
     */
    if (!account && result.kind === 'trip') markFreeSearchUsed()
  }

  function selectRoute(option: RouteOption) {
    setShown(option)
  }

  /**
   * 처음 화면으로.
   *
   * 결과는 라우터가 아니라 이 화면의 상태라서, 헤더의 `/` 링크만으로는
   * 아무것도 되돌아가지 않는다 — 로고를 눌러도 답이 그대로 남아 있었다.
   */
  function goHome() {
    setOutcome(null)
    setShown(null)
    setLastQuery(null)
    setHovered(null)
    setQueryOpen(false)
    setResetKey((n) => n + 1)
    window.scrollTo({ top: 0 })
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
  /**
   * 판에 실제로 답이 걸렸는지. 질의를 접는 기준은 이것이어야 한다 —
   * outcome 만 보면 경로를 못 찾은 경우(gap·no-route)에도 폼이 접히는데,
   * 그때는 판에 답이 없어 다시 펼 단추도 안 붙는다. 조건을 바꿔봐야 하는
   * 바로 그 상황에서 폼도 단추도 없이 갇힌다.
   */
  const hasAnswer = outcome?.kind === 'trip' && shown !== null

  return (
    <div className="page">
      <SiteHeader t={t} solid={hasResult} onHome={goHome} onHowTo={() => setTour(true)} />
      <QuickRoutes
        places={places}
        t={t}
        ready={Boolean(origin.coords) || origin.name.trim().length > 0}
        onPick={(place) =>
          run({
            mode: 'departNow',
            from: origin.name,
            to: place.name,
            when: null,
            fromCoords: origin.coords,
          })
        }
      />

      <Hero
        t={t}
        pending={pending}
        queryOpen={!hasAnswer || queryOpen}
        onToggleQuery={() => setQueryOpen((v) => !v)}
          headline={
            outcome?.kind === 'trip' && shown ? (
              <div className="verdict">
                <div className="verdict__depart">
                  {dayTag(shown.legs[0].departAt, now, t.clock) && (
                    <span className="verdict__day">
                      {dayTag(shown.legs[0].departAt, now, t.clock)}
                    </span>
                  )}
                  <span className="verdict__time num">{hhmm(shown.legs[0].departAt)}</span>
                  <Countdown departAt={shown.legs[0].departAt} t={t} />
                </div>
                <p className="verdict__arrive">
                  {t.result.arriveAt(clock(shown.legs[shown.legs.length - 1].arriveAt))}
                  <span className="verdict__sep">·</span>
                  {t.result.totalDuration(
                    humanDuration(
                      diffMin(shown.legs[shown.legs.length - 1].arriveAt, shown.legs[0].departAt),
                      UNIT,
                    ),
                  )}
                  {shown.id === outcome.chosen.id ? (
                    <span className="verdict__tag">{t.route.chosen[outcome.reason]}</span>
                  ) : (
                    <span className="verdict__tag verdict__tag--alt">
                      {describeRoute(shown.legs).carrier ?? t.route.unnamed}
                    </span>
                  )}
                </p>
                {/* 서버가 무엇으로 해석했는지 보여준다. "집" 같은 말이
                    엉뚱한 가게로 잡혀도 여기서 바로 눈에 띈다. */}
                {resolved && (
                  <p className="verdict__resolved">
                    {t.result.resolvedAs(resolved.from.name, resolved.to.name)}
                  </p>
                )}
                <TripStats legs={shown.legs} t={t} />
              </div>
            ) : undefined
          }
        aside={<HowItWorks t={t} inline />}
      >
        <SearchPanel
          key={resetKey}
          t={t}
          onSubmit={run}
          pending={pending}
          origin={origin}
          onOriginChange={setOrigin}
        />
      </Hero>

      <div className="shell">
        {verifyNotice && t.verifyNotice[verifyNotice] && (
          <div
            className={`notice ${verifyNotice === 'ok' ? 'notice--ok' : 'notice--warn'}`}
            role="status"
          >
            <span aria-hidden="true">{verifyNotice === 'ok' ? '✓' : '!'}</span>
            <span>{t.verifyNotice[verifyNotice]}</span>
          </div>
        )}
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

        {!pending && outcome?.kind === 'trip' && shown && (
          <>

            <AddToCalendar legs={shown.legs} now={now} t={t} />

            {outcome.estimated && (
              <div className="notice notice--warn" role="status">
                <span aria-hidden="true">≈</span>
                <span>{t.result.estimated}</span>
              </div>
            )}

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

              {(
                <aside className="col col--rail">
                <Alternatives
                  chosen={outcome.chosen}
                  others={outcome.others}
                  reason={t.route.chosen[outcome.reason]}
                  now={now}
                  t={t}
                  onSelect={selectRoute}
                  selectedId={shown.id}
                />
              </aside>
              )}
            </div>
          </>
        )}
      </div>

      <SiteFooter t={t} onHowTo={() => setTour(true)} />
      <Tour t={t} open={tour} onClose={() => setTour(false)} />
      <SignUpWall t={t} open={wall} onClose={() => setWall(false)} />
      <QuotaWall
        t={t}
        open={quotaWall !== null}
        limit={quotaWall ?? 3}
        onClose={() => setQuotaWall(null)}
      />
    </div>
  )
}
