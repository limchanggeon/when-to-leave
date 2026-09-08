import { useEffect, useRef, useState } from 'react'
import { LANGS } from '../../i18n'
import { usePrefs } from '../PrefsContext'

/**
 * 언어 고르기. **단추 하나에 지구본 하나.**
 *
 * 예전에는 언어마다 단추를 하나씩 늘어놓았다. 둘일 때는 괜찮았지만
 * 셋이 되면서 머리말이 밀렸고, 언어가 더 붙으면 계속 밀린다.
 * 지구본은 글자를 못 읽는 사람도 알아보는 몇 안 되는 그림이라,
 * 이 앱이 아이콘을 거의 안 쓰는데도 여기서는 값을 한다.
 *
 * 목록의 이름은 **그 언어 자신의 말**로 적는다(日本語, English).
 * "일본어" 라고 적으면 한국어를 못 읽는 사람은 자기 언어를 못 찾는다.
 */
export function LangMenu({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = usePrefs()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  /* 바깥을 누르거나 Esc 를 누르면 닫는다. 열어놓고 다른 일을 하다 잊는 창이 없게 한다. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      // 닫으면 초점을 단추로 되돌린다 — 키보드로 온 사람이 갈 곳을 잃지 않게
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = LANGS.find((l) => l.id === lang)

  return (
    <div className={`langmenu ${className}`} ref={boxRef}>
      <button
        ref={btnRef}
        type="button"
        className="langmenu__btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        /* 그림뿐이라 이름을 붙여준다. 지금 무엇이 골라져 있는지도 함께 읽힌다 */
        aria-label={`${t.nav.language} — ${current?.label ?? ''}`}
        title={t.nav.language}
      >
        <Globe />
      </button>

      {open && (
        <div className="langmenu__pop" role="group" aria-label={t.nav.language}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`langmenu__item ${lang === l.id ? 'is-on' : ''}`}
              aria-pressed={lang === l.id}
              onClick={() => {
                setLang(l.id)
                setOpen(false)
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 지구본. 로고와 같은 굵기의 선으로 그린다 — 채운 그림이나 그림문자를
 * 쓰면 이 판에서 혼자 다른 곳에서 온 것처럼 보인다.
 */
function Globe() {
  return (
    <svg className="langmenu__globe" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18M3.6 9h16.8M3.6 15h16.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
