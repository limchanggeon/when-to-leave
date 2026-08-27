import { useState } from 'react'
import type { I18nShape } from '../../i18n'
import { parseUtterance } from '../../parse/parse'

export interface QueryInput {
  mode: 'arriveBy' | 'departNow'
  from: string
  to: string
  /** "HH:mm" — departNow 모드에서는 null */
  when: string | null
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
            <label className="field">
              <span className="field__label">{t.search.from}</span>
              <input
                className="field__input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder={t.search.fromPlaceholder}
              />
            </label>

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

            <label className="field">
              <span className="field__label">{t.search.to}</span>
              <input
                className="field__input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder={t.search.toPlaceholder}
                required
              />
            </label>
          </div>

          {mode === 'arriveBy' && (
            <div className="panel__row panel__row--time">
              <label className="field field--time">
                <span className="field__label">{t.search.arriveBy}</span>
                <input
                  className="field__input"
                  type="time"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
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

      <button className="panel__submit" type="submit" disabled={!canSubmit || pending}>
        {pending ? t.search.calculating : t.search.submit}
      </button>
    </form>
  )
}
