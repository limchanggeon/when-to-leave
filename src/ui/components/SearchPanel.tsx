import { useEffect, useRef, useState } from 'react'
import type { I18nShape } from '../../i18n'
import { parseUtterance } from '../../parse/parse'
import { locate, permissionState, type Coords, type GeoFailure } from '../../geo'
import { fetchMe, type SavedPlace } from '../../auth/me'
import { reverseGeocode } from '../../geo/reverse'

export interface QueryInput {
  mode: 'arriveBy' | 'departNow'
  from: string
  to: string
  /** "HH:mm" — departNow 모드에서는 null */
  when: string | null
  /** 현재 위치로 잡았다면 좌표가 함께 간다. 지명보다 좌표가 정확하다. */
  fromCoords?: Coords
}

const pad = (n: number) => String(n).padStart(2, '0')
const plusMinutes = (min: number): string => {
  const d = new Date(Date.now() + min * 60_000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 항목별 입력이 기본. 문장 입력은 토글로 남겨둔다.
 *
 * 빈 텍스트 상자 하나만 두면 무엇을 물어볼 수 있는지 알 수가 없다 —
 * 필드와 버튼이 보이는 것 자체가 사용법 설명이다.
 */
export function SearchPanel({
  t,
  onSubmit,
  pending,
}: {
  t: I18nShape
  onSubmit: (q: QueryInput) => void
  pending: boolean
}) {
  const [mode, setMode] = useState<QueryInput['mode']>('arriveBy')
  const [freeform, setFreeform] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [when, setWhen] = useState('')
  const [text, setText] = useState('')
  const [fromCoords, setFromCoords] = useState<Coords | undefined>()
  /**
   * 위치로 채워 넣은 이름. 좌표와 짝이다.
   *
   * 이 값과 입력창 내용이 같으면 좌표는 아직 유효하다.
   * 브라우저 자동완성이 change 이벤트를 쏘거나 리렌더가 끼어들 때
   * 값이 그대로인데도 좌표만 지워지는 일을 막는다 —
   * 그러면 이름만 "현재 위치" 로 남고 좌표가 사라져,
   * 서버가 그 글자를 검색해 엉뚱한 곳을 잡는다.
   */
  const [geoName, setGeoName] = useState<string | null>(null)
  /** 마이페이지에 저장해둔 장소. 로그인 안 했으면 비어 있다. */
  const [saved, setSaved] = useState<SavedPlace[]>([])

  useEffect(() => {
    let cancelled = false
    fetchMe().then((r) => {
      if (!cancelled && r.ok) setSaved(r.data.places)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** 저장된 장소를 고르면 좌표까지 함께 들어온다 — 이름을 검색할 일이 없다. */
  function pickSaved(place: SavedPlace) {
    setFrom(place.name)
    setFromCoords({ lat: place.lat, lng: place.lng, accuracyM: null })
    setGeoName(place.name)
    setGeoError(null)
  }
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeoFailure | null>(null)

  /**
   * @param auto 페이지 진입 시 자동 실행인지.
   *   자동 실행이 실패하면 배너를 띄우지 않는다 — 사용자가 누르지도 않았는데
   *   빨간 오류가 떠 있으면 노이즈다. 버튼은 그대로 남으니 직접 눌러 볼 수 있다.
   */
  async function useCurrentLocation(auto = false) {
    setLocating(true)
    if (!auto) setGeoError(null)

    /*
     * 이미 거부돼 있으면 호출해봐야 창이 안 뜨고 바로 실패한다.
     *
     * 자동 실행이라도 이 경우만은 알려준다. 스스로 풀리지 않는 상태라
     * 조용히 넘어가면 사용자는 "왜 아무것도 안 채워지지" 로만 남는다.
     * (다른 실패는 다시 눌러보면 되므로 자동 실행에서는 조용히 지나간다.)
     */
    if ((await permissionState()) === 'denied') {
      setGeoError({ code: 'denied' })
      setLocating(false)
      return
    }

    const located = await locate()
    if (!located.ok) {
      if (!auto) setGeoError(located.failure)
      setLocating(false)
      return
    }

    /*
     * 좌표를 받는 즉시 쓸 수 있게 한다.
     *
     * 경로 계산에 필요한 건 좌표뿐이고 이름은 화면 표시용이다.
     * 주소 변환이 끝날 때까지 입력창을 비워두면, 변환이 느리거나 실패하는
     * 동안(재시도 포함 십수 초) 아무것도 안 채워진 것처럼 보인다.
     */
    const placeholder = t.geo.currentLocation
    setFrom(placeholder)
    setFromCoords(located.data)
    setGeoName(placeholder)
    setLocating(false)

    // 주소는 뒤따라 온다. 그 사이 사용자가 고쳐 적었으면 덮어쓰지 않는다.
    const named = await reverseGeocode(located.data)
    if (!named.ok) return
    setFrom((current) => (current === placeholder ? named.data : current))
    setGeoName((current) => (current === placeholder ? named.data : current))
  }

  /**
   * 출발지는 거의 항상 "지금 있는 곳"이라 처음부터 채워둔다.
   *
   * 다만 이미 거부된 경우에는 시도하지 않는다 — 창이 뜨지도 않고,
   * 실패만 반복하며 버튼을 잠깐씩 잠글 뿐이다.
   * 권한을 아직 안 물어봤다면 여기서 창이 뜬다. 폼이 이미 그려진 뒤라
   * 무엇 때문에 묻는지가 화면에 보이는 상태에서 뜬다.
   */
  const autoTried = useRef(false)
  useEffect(() => {
    if (autoTried.current) return
    autoTried.current = true

    let cancelled = false
    permissionState().then((state) => {
      if (cancelled || state === 'denied') return
      void useCurrentLocation(true)
    })
    return () => {
      cancelled = true
    }
    // 마운트 시 한 번만. autoTried 로 StrictMode 이중 실행도 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 좌표를 잃은 채 위치 딱지만 남았는지. 이대로 보내면 그 글자가 검색된다. */
  const staleGeoName = !fromCoords && geoName !== null && from === geoName
  const canSubmit = freeform
    ? text.trim().length > 0
    : to.trim().length > 0 && !staleGeoName

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || pending) return

    if (freeform) {
      // 문장 입력은 파서를 거친다. 항목 입력은 파서가 필요 없다.
      const parsed = parseUtterance(text.trim())
      onSubmit({
        mode: parsed.mode,
        from: parsed.from ?? '',
        to: parsed.to ?? '',
        when: parsed.when,
      })
      return
    }
    // 목적지만 넣어도 답이 나와야 한다.
    // 도착 시각을 비웠다면 임의의 시각을 지어내지 말고 "지금 출발" 로 푼다.
    const effectiveMode = mode === 'arriveBy' && !when ? 'departNow' : mode
    onSubmit({
      mode: effectiveMode,
      from: from.trim(),
      to: to.trim(),
      when: effectiveMode === 'arriveBy' ? when : null,
      fromCoords,
    })
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel__top">
        <div className="modeswitch" role="group" aria-label="계산 방식">
          <button
            type="button"
            className={`modeswitch__btn ${mode === 'arriveBy' ? 'is-on' : ''}`}
            onClick={() => setMode('arriveBy')}
            aria-pressed={mode === 'arriveBy'}
          >
            {t.search.modeArriveBy}
          </button>
          <button
            type="button"
            className={`modeswitch__btn ${mode === 'departNow' ? 'is-on' : ''}`}
            onClick={() => setMode('departNow')}
            aria-pressed={mode === 'departNow'}
          >
            {t.search.modeDepartNow}
          </button>
        </div>

        <button type="button" className="panel__toggle" onClick={() => setFreeform((v) => !v)}>
          {freeform ? t.search.structured : t.search.freeText}
        </button>
      </div>

      {freeform ? (
        <input
          className="panel__free"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.search.placeholder}
          aria-label={t.search.placeholder}
        />
      ) : (
        <>
          <div className="panel__row">
            {/* label 안에 button 을 넣으면 라벨이 클릭을 입력창으로 넘겨
                버튼이 안 눌린다. 그래서 label 은 텍스트에만 걸고 버튼은 형제로 둔다. */}
            <div className="field">
              <div className="field__head">
                <label className="field__label" htmlFor="field-from">
                  {t.search.from}
                  <span className="field__optional">{t.search.optional}</span>
                </label>
                <span className="field__actions">
                  {saved.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      className="field__saved"
                      onClick={() => pickSaved(place)}
                      title={place.name}
                    >
                      {place.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="field__geo"
                    onClick={() => useCurrentLocation()}
                    disabled={locating}
                  >
                    {locating ? t.geo.locating : `◎ ${t.geo.use}`}
                  </button>
                </span>
              </div>
              <input
                id="field-from"
                className="field__input"
                value={from}
                autoComplete="off"
                onChange={(e) => {
                  const next = e.target.value
                  setFrom(next)
                  // 값이 실제로 달라졌을 때만 좌표를 버린다.
                  // 값이 그대로인 change 이벤트(자동완성 등)에 좌표를 잃으면
                  // 이름만 남아 엉뚱한 곳이 검색된다.
                  if (next !== geoName) {
                    setFromCoords(undefined)
                    setGeoName(null)
                  }
                }}
                placeholder={t.search.fromPlaceholder}
              />
            </div>

            <button
              type="button"
              className="panel__swap"
              onClick={() => {
                setFrom(to)
                setTo(from)
              }}
              title={t.search.swap}
              aria-label={t.search.swap}
            >
              ⇄
            </button>

            <div className="field">
              <div className="field__head">
                <label className="field__label" htmlFor="field-to">
                  {t.search.to}
                </label>
              </div>
              <input
                id="field-to"
                className="field__input"
                value={to}
                autoComplete="off"
                onChange={(e) => setTo(e.target.value)}
                placeholder={t.search.toPlaceholder}
                required
                autoFocus
              />
            </div>
          </div>

          {mode === 'arriveBy' && (
            <div className="panel__row panel__row--time">
              <div className="field field--time">
                <div className="field__head">
                  <label className="field__label" htmlFor="field-when">
                    {t.search.arriveBy}
                    <span className="field__optional">{t.search.optional}</span>
                  </label>
                </div>
                <input
                  id="field-when"
                  className="field__input"
                  type="time"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </div>
              <div className="chips">
                <span className="chips__label">{t.search.quickTime}</span>
                {t.search.presets.map((p) => (
                  <button
                    key={p.time}
                    type="button"
                    className={`chips__btn ${when === p.time ? 'is-on' : ''}`}
                    onClick={() => setWhen(p.time)}
                  >
                    {p.label}
                  </button>
                ))}
                <button type="button" className="chips__btn" onClick={() => setWhen(plusMinutes(60))}>
                  {t.search.hourLater}
                </button>
                {!when && <span className="chips__hint">{t.search.whenHint}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {geoError && (
        <p className="panel__geoerror" role="alert">
          {t.geo.err[geoError.code]}
        </p>
      )}
      {staleGeoName && (
        <p className="panel__geoerror" role="alert">
          {t.geo.staleCoords}
        </p>
      )}

      <button className="panel__submit" type="submit" disabled={!canSubmit || pending}>
        {pending ? t.search.calculating : t.search.submit}
      </button>
    </form>
  )
}
