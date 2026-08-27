import { useState } from 'react'
import type { I18nShape } from '../../i18n'
import { parseUtterance } from '../../parse/parse'
import { currentPlace, permissionState, type Coords, type GeoFailure } from '../../geo'

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
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<GeoFailure | null>(null)

  async function useCurrentLocation() {
    setLocating(true)
    setGeoError(null)

    // 이미 거부돼 있으면 호출해봐야 창이 안 뜨고 바로 실패한다.
    // 먼저 확인해서 "왜 아무 일도 안 일어나는지"를 알려준다.
    if ((await permissionState()) === 'denied') {
      setGeoError({ code: 'denied' })
      setLocating(false)
      return
    }

    const r = await currentPlace(t.geo.currentLocation)
    if (r.ok) {
      setFrom(r.data.name)
      setFromCoords(r.data.coords)
    } else {
      setGeoError(r.failure)
    }
    setLocating(false)
  }

  const canSubmit = freeform ? text.trim().length > 0 : to.trim().length > 0

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
    onSubmit({
      mode,
      from: from.trim(),
      to: to.trim(),
      when: mode === 'arriveBy' ? when || null : null,
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
                </label>
                <button
                  type="button"
                  className="field__geo"
                  onClick={useCurrentLocation}
                  disabled={locating}
                >
                  {locating ? t.geo.locating : `◎ ${t.geo.use}`}
                </button>
              </div>
              <input
                id="field-from"
                className="field__input"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  // 직접 고쳐 적으면 아까 잡은 좌표는 더 이상 그 지명이 아니다
                  setFromCoords(undefined)
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
                onChange={(e) => setTo(e.target.value)}
                placeholder={t.search.toPlaceholder}
                required
              />
            </div>
          </div>

          {mode === 'arriveBy' && (
            <div className="panel__row panel__row--time">
              <div className="field field--time">
                <div className="field__head">
                  <label className="field__label" htmlFor="field-when">
                    {t.search.arriveBy}
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

      <button className="panel__submit" type="submit" disabled={!canSubmit || pending}>
        {pending ? t.search.calculating : t.search.submit}
      </button>
    </form>
  )
}
