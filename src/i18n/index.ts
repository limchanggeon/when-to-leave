import { ko } from './ko'

export type Lang = 'ko' | 'ja' | 'en'
export type { I18nShape } from './ko'

/**
 * 한국어는 늘 들어 있고, 일본어는 고른 사람만 받는다.
 *
 * 두 사전을 다 묶으면 일본어 것만으로 메인 번들의 gzip 5.4 kB(5.1%)를
 * 차지한다. 한국어로 들어온 사람은 열어보지도 않을 글이다.
 *
 * 한국어를 그대로 둔 것은 **기본값이라 기다릴 수 없기 때문이다.** 첫 화면을
 * 그리려면 지금 당장 있어야 한다. 일본어는 한 번 더 받아오면 되고,
 * 그동안은 PrefsContext 가 화면을 잠깐 붙들어 한국어가 스쳤다 바뀌는 일을 막는다.
 */
export const dictionaries = { ko }

export const loadDictionary = async (lang: Lang) => {
  if (lang === 'ja') return (await import('./ja')).ja
  if (lang === 'en') return (await import('./en')).en
  return ko
}

/** 고를 수 있는 언어. 화면에 보이는 이름은 그 언어 자신의 말로 적는다 —
 *  영어를 못 읽는 사람도 "English" 는 알아본다. */
export const LANGS: { id: Lang; label: string; htmlLang: string }[] = [
  { id: 'ko', label: '한국어', htmlLang: 'ko' },
  { id: 'ja', label: '日本語', htmlLang: 'ja' },
  { id: 'en', label: 'English', htmlLang: 'en' },
]
