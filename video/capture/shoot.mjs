// Drives the live Doom site and captures the frames the video is cut from.
// Real UI, real mainnet reads — nothing here is a mockup.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SITE = process.env.SITE ?? 'https://neromtoobad.github.io/doom/'
const OUT = join(ROOT, 'public/shots') + '/'
mkdirSync(OUT, { recursive: true })

// Element boxes, normalised against the viewport, so the video's callouts sit
// exactly on the UI instead of on coordinates someone eyeballed off a PNG.
const RECTS = {}
const VW = 1600, VH = 900

const rect = async (page, shotName, key, fn) => {
  const box = await page.evaluate(fn)
  if (!box) { console.log('    · no rect for', shotName + '.' + key); return }
  RECTS[shotName] ??= {}
  RECTS[shotName][key] = {
    nx: box.x / VW, ny: box.y / VH, nw: box.w / VW, nh: box.h / VH,
  }
}

const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: OUT + name + '.png', animations: 'disabled', ...opts })
  console.log('  ✓', name)
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
})

console.log('→ loading', SITE)
await page.goto(SITE, { waitUntil: 'networkidle', timeout: 90_000 })

// The board is populated from mainnet, so wait for real cards rather than a timer.
await page.waitForSelector('text=/Will .* close above/', { timeout: 90_000 })
await page.waitForTimeout(2500)
console.log('→ markets loaded')

const boxOf = (el) => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}
const findByText = (tag, text) =>
  `(() => { const boxOf = ${boxOf.toString()};
     const el = [...document.querySelectorAll('${tag}')].find(n => (n.textContent||'').trim() === ${JSON.stringify(text)});
     return boxOf(el?.parentElement ?? el) })()`

// "BETTORS KNOWN 0" — the number the whole project is about.
await rect(page, '01-hero', 'bettorsKnown', findByText('dt', 'Bettors known'))
await shot(page, '01-hero')

// The whole page in one tall frame, for the slow pan.
await shot(page, '00-fullpage', { fullPage: true })

// Board.
await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'instant' }))
await rect(page, '02-board', 'firstCard', `(() => { const boxOf = ${boxOf.toString()};
  return boxOf(document.querySelector('h2')?.closest('button')) })()`)
await shot(page, '02-board')

// Filter to crypto.
await page.getByText('Crypto', { exact: true }).first().click()
await shot(page, '03-crypto')
await page.getByText('All markets', { exact: true }).first().click()
await page.waitForTimeout(300)

// Cards render the question as an <h2>; the ticker uses <span> and never stops
// moving, so anchoring on the heading is what keeps the locator stable.
const openCard = (re) => page.locator('h2').filter({ hasText: re }).first()
const card = openCard(/Will BTC close above \$150,000/)
await card.click({ force: true })
await page.waitForTimeout(1800)
await shot(page, '04-market')
const toPanel = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('h2')].find(h => h.textContent === 'Take a position')
  el?.scrollIntoView({ block: 'center', behavior: 'instant' })
})
await toPanel()
await shot(page, '04b-panel')

// Type a stake so the contract's own quote() renders.
const amt = page.locator('input[placeholder="1.0"]').first()
if (await amt.count()) {
  await amt.fill('')
  await amt.type('5', { delay: 120 })
  await page.waitForTimeout(1400)
  await toPanel()
  await rect(page, '05-quote-yes', 'quote', `(() => { const boxOf = ${boxOf.toString()};
    const el = [...document.querySelectorAll('span')].find(n => n.textContent === 'You receive');
    return boxOf(el?.closest('div')?.parentElement) })()`)
  await rect(page, '05-quote-yes', 'sides', `(() => { const boxOf = ${boxOf.toString()};
    const el = [...document.querySelectorAll('span')].find(n => n.textContent === 'Yes' && n.parentElement?.tagName === 'BUTTON');
    return boxOf(el?.closest('button')?.parentElement) })()`)
  await rect(page, '05-quote-yes', 'cta', `(() => { const boxOf = ${boxOf.toString()};
    return boxOf([...document.querySelectorAll('button')].find(n => /Bet privately|Connect/.test(n.textContent||''))) })()`)
  await shot(page, '05-quote-yes')
}

// Flip to NO — the other side of the same curve.
const no = page.locator('text=/^No$/').last()
if (await no.count()) {
  await no.click()
  await page.waitForTimeout(1400)
  await toPanel()
  await shot(page, '06-quote-no')
}

// Settlement panel + chart live further down the detail column.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find(s => s.textContent === 'How this settles')
  el?.scrollIntoView({ block: 'center', behavior: 'instant' })
})
await shot(page, '07-settles')

await page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find(s => s.textContent === 'Probability history')
  el?.scrollIntoView({ block: 'center', behavior: 'instant' })
})
await rect(page, '08-chart', 'chart', `(() => { const boxOf = ${boxOf.toString()};
  const el = [...document.querySelectorAll('span')].find(n => n.textContent === 'Probability history');
  return boxOf(el?.closest('div')?.parentElement) })()`)
await shot(page, '08-chart')

// The settled market, where the outcome is already recorded on chain.
await page.getByText('← All markets').first().click()
await page.waitForTimeout(1200)
await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'instant' }))
await page.waitForTimeout(400)
const settled = openCard(/strk20-hackathon PR #100/)
await settled.click({ force: true })
await page.waitForTimeout(1800)
await page.evaluate(() => {
  const el = [...document.querySelectorAll('h2')].find(h => /PR #100/.test(h.textContent ?? ''))
  el?.scrollIntoView({ block: 'center', behavior: 'instant' })
})
await shot(page, '09-settled')

// My bets.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
await page.getByText('My bets', { exact: true }).first().click().catch(() => {})
await page.waitForTimeout(900)
await shot(page, '10-portfolio')

writeFileSync(
  join(ROOT, 'src/data/rects.json'),
  JSON.stringify(RECTS, null, 2),
)
await browser.close()
console.log('done →', OUT)
