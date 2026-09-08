import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { dictionaries, loadDictionary, type I18nShape, type Lang } from '../i18n'
import { webStorage } from './storage'

export type Theme = 'light' | 'dark' | 'system'

interface Prefs {
  lang: Lang
  /**
   * 지금 언어의 사전.
   *
   * 화면들이 각자 `dictionaries[lang]` 을 하지 않고 여기서 받아 간다.
   * 일본어 사전은 따로 받아오는 것이라, 받아왔는지를 아는 곳이 하나여야 한다.
   */
  t: I18nShape
  theme: Theme
  setLang(l: Lang): void
  setTheme(t: Theme): void
}

const KEY_LANG = 'wtl.lang'
const KEY_THEME = 'wtl.theme'

const Ctx = createContext<Prefs | null>(null)

const JA_FONT =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&display=swap'

/**
 * 일본어 폰트는 일본어를 고른 사람만 받는다.
 *
 * index.html 에 같이 넣어두면 한국어로 들어온 사람도 렌더 전에 이걸 기다린다 —
 * CJK 폰트는 unicode-range 목록이 길어서 스타일시트만 gzip 118 kB 다.
 * 한국어 화면에는 KR 폰트로 다 그려지므로 받을 이유가 없다.
 *
 * 늦게 붙어도 괜찮다. display=swap 이라 폰트가 오기 전에는 대체 글꼴로
 * 먼저 보이고, 오면 바뀐다.
 */
function loadJapaneseFont(): void {
  if (document.querySelector(`link[href="${JA_FONT}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = JA_FONT
  document.head.appendChild(link)
}

const readLang = (): Lang => {
  const v = webStorage.get(KEY_LANG)
  return v === 'ja' || v === 'en' ? v : 'ko'
}
const readTheme = (): Theme => {
  const v = webStorage.get(KEY_THEME)
  return v === 'light' || v === 'dark' ? v : 'system'
}

/**
 * 언어·테마 같은 화면 설정. 서버가 알 필요 없는 값이라 로컬에만 둔다.
 * 사전(i18n)과 다크 토큰은 이미 있었는데 바꿀 수단이 없었다.
 */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  const [theme, setThemeState] = useState<Theme>(readTheme)
  /*
   * 한국어는 이미 손에 있으므로 바로 그린다. 일본어면 사전이 올 때까지
   * 화면을 붙든다 — 안 그러면 한국어가 한 번 스쳤다가 일본어로 바뀐다.
   */
  const [t, setT] = useState<I18nShape>(dictionaries.ko)
  const [ready, setReady] = useState(() => readLang() === 'ko')

  // system 이면 속성을 지운다 — 그래야 prefers-color-scheme 이 다시 작동한다
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
    if (lang === 'ja') loadJapaneseFont()

    let cancelled = false
    void loadDictionary(lang).then((dict) => {
      if (cancelled) return
      setT(dict)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    webStorage.set(KEY_LANG, l)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    webStorage.set(KEY_THEME, t)
  }, [])

  return (
    <Ctx.Provider value={{ lang, t, theme, setLang, setTheme }}>
      {ready ? children : <div className="page" aria-busy="true" />}
    </Ctx.Provider>
  )
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx)
  if (!v) throw new Error('PrefsProvider 안에서만 쓸 수 있습니다')
  return v
}
