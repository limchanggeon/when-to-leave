import { useState } from 'react'
import type { I18nShape } from '../../i18n'

export function SearchBar({
  t,
  onSubmit,
  pending,
  examples,
}: {
  t: I18nShape
  onSubmit: (text: string) => void
  pending: boolean
  examples: string[]
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
      <input
        className="search__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.search.placeholder}
        aria-label={t.search.placeholder}
        list="examples"
      />
      <datalist id="examples">
        {examples.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <button className="search__submit" type="submit" disabled={pending || !value.trim()}>
        {pending ? '…' : t.search.submit}
      </button>
    </form>
  )
}
