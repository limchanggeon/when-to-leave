/**
 * 앱 아이콘과 스플래시를 만든다. 로고를 고쳤을 때만 돌린다.
 *
 *   pnpm app:icons
 *
 * @capacitor/assets 를 쓰지 않는 이유: 그게 sharp 를 끌고 오는데 네이티브
 * 바이너리가 안 붙어 여기서도 서버에서도 실패했다. 서버는 웹만 빌드하는데도
 * 그 꾸러미 때문에 pnpm install 이 통째로 실패해 배포가 멈췄다.
 * 그림 몇 장 만들자고 그런 것을 달고 있을 이유가 없다 —
 * 이미 있는 브라우저로 SVG 를 그려서 찍는다.
 *
 * 문양은 public/favicon.svg 와 같다. 한 곳에서 고치면 양쪽이 같이 바뀌도록
 * 여기에도 같은 path 를 둔다(파일을 읽어 쓰면 배경 사각형까지 딸려온다).
 */
import { chromium } from 'playwright-core'

const RES = 'android/app/src/main/res'
const INK = '#0C1A2B'

/** 시계 문양만. 배경 사각형은 쓰는 곳마다 다르게 붙인다. */
const MARK = `
  <circle cx="32" cy="35" r="18" fill="none" stroke="#FFB01F" stroke-width="4" stroke-dasharray="80 25" stroke-linecap="round"/>
  <path d="M 27,13 L 37,13" stroke="#FFB01F" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="21" y1="46" x2="39" y2="28" stroke="#FFB01F" stroke-width="4" stroke-linecap="round"/>
  <path d="M 29,28 L 39,28 L 39,38" fill="none" stroke="#FFB01F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`

/**
 * viewBox 와 실제 픽셀 크기를 따로 준다.
 *
 * 둘을 같이 두면 판을 아무리 키워도 64px 로 그려진다 — 실제로 그래서
 * 원형 아이콘과 적응형 앞판이 작게 나왔다.
 */
const svg = (box: number, w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${(box * h) / w}" width="${w}" height="${h}">${body}</svg>`

const square = (s: number) => svg(64, s, s, `<rect width="64" height="64" rx="14" fill="${INK}"/>${MARK}`)
const circle = (s: number) => svg(64, s, s, `<circle cx="32" cy="32" r="32" fill="${INK}"/>${MARK}`)
/*
 * 적응형 아이콘의 앞판. 기기가 원·사각 등 제멋대로 잘라내는데 **안쪽 66% 만
 * 늘 보인다.** 문양을 그대로 두면 시계 테두리가 잘려 나가므로 0.62 배로 줄인다.
 */
const foreground = (s: number) => svg(64, s, s, `<g transform="translate(32,32) scale(0.62) translate(-32,-32)">${MARK}</g>`)
const splash = (w: number, h: number) =>
  svg(w, w, h, `<rect width="${w}" height="${h}" fill="${INK}"/>` +
    `<g transform="translate(${w / 2},${h / 2}) scale(${(Math.min(w, h) / 64) * 0.22}) translate(-32,-32)">${MARK}</g>`)

/** 배율. mdpi 를 1 로 놓고 나머지가 그 배수다. */
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
/** 스플래시 판 크기(세로 기준). 가로는 뒤집어 쓴다. */
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }

interface Job { path: string; svg: string; w: number; h: number; transparent: boolean }
const jobs: Job[] = []

for (const [d, m] of Object.entries(DENSITY)) {
  const icon = Math.round(48 * m) // 런처 아이콘은 48dp
  const fore = Math.round(108 * m) // 적응형 판은 108dp
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher.png`, svg: square(icon), w: icon, h: icon, transparent: false })
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher_round.png`, svg: circle(icon), w: icon, h: icon, transparent: true })
  jobs.push({ path: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, svg: foreground(fore), w: fore, h: fore, transparent: true })
}
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  jobs.push({ path: `${RES}/drawable-port-${d}/splash.png`, svg: splash(w, h), w, h, transparent: false })
  jobs.push({ path: `${RES}/drawable-land-${d}/splash.png`, svg: splash(h, w), w: h, h: w, transparent: false })
}
jobs.push({ path: `${RES}/drawable/splash.png`, svg: splash(480, 800), w: 480, h: 800, transparent: false })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
for (const j of jobs) {
  await page.setViewportSize({ width: j.w, height: j.h })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${j.svg}`)
  await page.screenshot({ path: j.path, omitBackground: j.transparent })
}
await browser.close()
console.log(`아이콘·스플래시 ${jobs.length}개를 새로 그렸습니다`)
