import { useState } from 'react'
import type { I18nShape } from '../../i18n'

export function SearchBar({
  t,
  onSubmit,
  pending,
}: {
  t: I18nShape
  onSubmit: (text: string) => void
  pending: boolean
}) {
  const [value, setValue] = useState('')

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <div className="search__row">
        <input
          className="search__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.search.placeholder}
          aria-label={t.search.placeholder}
        />
        <button className="search__submit" type="submit" disabled={pending || !value.trim()}>
          {t.search.submit}
        </button>
      </div>
      <span className="search__hint">M0 파서: 정규식 기반. 예: "수서에서 동대구 11시까지"</span>
    </form>
  )
}
