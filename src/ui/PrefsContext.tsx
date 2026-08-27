import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Lang } from '../i18n'
import { webStorage } from './storage'

export type Theme = 'light' | 'dark' | 'system'

interface Prefs {
  lang: Lang
  theme: Theme
  setLang(l: Lang): void
  setTheme(t: Theme): void
}

const KEY_LANG = 'wtl.lang'
const KEY_THEME = 'wtl.theme'

const Ctx = createContext<Prefs | null>(null)

const readLang = (): Lang => (webStorage.get(KEY_LANG) === 'ja' ? 'ja' : 'ko')
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

  // system 이면 속성을 지운다 — 그래야 prefers-color-scheme 이 다시 작동한다
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    webStorage.set(KEY_LANG, l)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    webStorage.set(KEY_THEME, t)
  }, [])

  return <Ctx.Provider value={{ lang, theme, setLang, setTheme }}>{children}</Ctx.Provider>
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx)
  if (!v) throw new Error('PrefsProvider 안에서만 쓸 수 있습니다')
  return v
}
