/**
 * 사용법 캡처를 다시 찍는다.
 *
 *   pnpm dev:all        # 다른 창에서 먼저 띄워둘 것 (실제 API 로 계산한다)
 *   pnpm shots
 *
 * 화면을 고치면 캡처가 같이 낡는다. 시각 언어를 손댔으면 이걸 돌릴 것.
 * 결과는 public/tutorial/{lang}-{n}.png 로 들어가고, 그대로 커밋한다.
 *
 * 브라우저는 시스템에 깔린 크롬을 빌려 쓴다(channel: 'chrome') — 이 스크립트
 * 하나 때문에 브라우저를 통째로 내려받게 하지 않는다.
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173'
const OUT = 'public/tutorial'
/** 캡처가 커지면 튜토리얼 여는 순간 그만큼 내려받는다. 2배 밀도는 쓰지 않는다. */
const VIEWPORT = { width: 1120, height: 720 }

/** 예시 질의. 실제로 답이 나오는 구간이어야 한다. */
const TRIP = { from: '수서', to: '동대구', when: '21:00' }

const LANGS = [
  { id: 'ko', tab: 1 },
  { id: 'ja', tab: 2 },
]

/** 요소 하나에 딱 맞춰 자른다. 빈 여백까지 담으면 화면에서 잘 안 보인다. */
async function shotOf(page, selector, path) {
  const el = await page.waitForSelector(selector, { timeout: 45_000 })
  await el.screenshot({ path })
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })

for (const lang of LANGS) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.click(`.langswitch__btn:nth-child(${lang.tab})`)
  await page.waitForTimeout(300)

  // 1. 무엇을 넣는 자리인지 — 아직 답이 없는 판.
  //    .board 가 아니라 .board__inner 를 찍는다. .board 에는 아래 설명 띠까지
  //    딸려 들어와서, "여기에 넣으세요" 를 말하는 그림이 되지 않는다.
  await page.fill('#field-from', TRIP.from)
  await page.fill('#field-to', TRIP.to)
  await page.fill('#field-when', TRIP.when)
  // 시각 칸을 채우면 오전/오후 조각이 선택된 채로 남아 파란 칠이 찍힌다
  await page.evaluate(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
  )
  await page.waitForTimeout(250)
  await shotOf(page, '.board__inner', `${OUT}/${lang.id}-1.png`)

  // 2. 답이 걸린 판
  await page.click('.panel__submit')
  await page.waitForSelector('.verdict__time', { timeout: 45_000 })
  await page.waitForTimeout(1200)
  await shotOf(page, '.board__inner', `${OUT}/${lang.id}-2.png`)

  // 3. 여정 상세 — 지도 타일이 들어올 때까지 조금 기다린다
  await page.waitForTimeout(2500)
  await shotOf(page, '.columns', `${OUT}/${lang.id}-3.png`)

  console.log(`${lang.id}: 3장`)
  await page.close()
}

await browser.close()
console.log(`→ ${OUT}/`)
