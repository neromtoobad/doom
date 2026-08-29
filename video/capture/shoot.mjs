// Drives the live site and captures the frames the film is cut from, plus the
// measured element boxes its callouts anchor to.
//
// Re-shot after the site grew from one page to five. Nothing here is staged: the
// board reads mainnet, the quotes come from the contracts, and the oracle panel is
// showing whatever Pragma is publishing at the moment the shutter opens.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = process.env.SITE ?? 'https://neromtoobad.github.io/doom/'
const OUT = join(ROOT, 'public/shots') + '/'
mkdirSync(OUT, { recursive: true })

const VW = 1600, VH = 900
const RECTS = {}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 })

const shot = async (name, opts = {}) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}${name}.png`, animations: 'disabled', ...opts })
  console.log('  ✓', name)
}

const boxOf = (el) => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

const rect = async (shotName, key, fn) => {
  const box = await page.evaluate(fn)
  if (!box) return console.log('    · no rect for', shotName + '.' + key)
  RECTS[shotName] ??= {}
  RECTS[shotName][key] = { nx: box.x / VW, ny: box.y / VH, nw: box.w / VW, nh: box.h / VH }
}

const byText = (tag, text) =>
  `(() => { const boxOf = ${boxOf.toString()};
     const el = [...document.querySelectorAll('${tag}')].find(n => (n.textContent||'').trim() === ${JSON.stringify(text)});
     return boxOf(el?.parentElement ?? el) })()`

const scrollTo = (tag, text) => page.evaluate(
  `(() => { const el = [...document.querySelectorAll('${tag}')].find(n => (n.textContent||'').includes(${JSON.stringify(text)}));
     el?.scrollIntoView({ block: 'center', behavior: 'instant' }) })()`)

// ── the board ───────────────────────────────────────────────────────────────────
console.log('→', SITE)
await page.goto(SITE, { waitUntil: 'networkidle', timeout: 120_000 })
await page.waitForSelector('text=/Will .* close above/', { timeout: 120_000 })
await page.waitForTimeout(3000)

await rect('01-hero', 'bettorsKnown', byText('dt', 'Bettors known'))
await shot('01-hero')
await shot('00-fullpage', { fullPage: true })

await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'instant' }))
await rect('02-board', 'firstCard', `(() => { const boxOf = ${boxOf.toString()};
  return boxOf(document.querySelector('h2')?.closest('button')) })()`)
await shot('02-board')

// ── a market: pricing, the honest fee, depth ────────────────────────────────────
const openCard = (re) => page.locator('h2').filter({ hasText: re }).first()
await openCard(/Will BTC close above \$150,000/).click({ force: true })
await page.waitForTimeout(2500)

const toPanel = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Take a position')
  el?.scrollIntoView({ block: 'center', behavior: 'instant' })
})
await toPanel()
await shot('03-market')

const amt = page.locator('input[placeholder="1.0"]').first()
if (await amt.count()) {
  await amt.fill(''); await amt.type('1', { delay: 110 })
  await page.waitForTimeout(1600)
  await toPanel()
  await rect('04-fee', 'fill', `(() => { const boxOf = ${boxOf.toString()};
    const el = [...document.querySelectorAll('span')].find(n => n.textContent === 'Pool fee');
    return boxOf(el?.closest('div')?.parentElement) })()`)
  await shot('04-fee')

  await amt.fill(''); await amt.type('40', { delay: 90 })
  await page.waitForTimeout(1800)
  await toPanel()
  await shot('05-fee-large')
}

await scrollTo('div', 'AVERAGE PRICE BY SIZE')
await shot('06-depth')

// ── the book: every size, no names ──────────────────────────────────────────────
await scrollTo('span', 'The book')
await rect('07-book', 'rows', `(() => { const boxOf = ${boxOf.toString()};
  const el = [...document.querySelectorAll('div')].find(n => n.className.includes('bookRows'));
  return boxOf(el) })()`)
await shot('07-book')

// ── oracle-informed settlement ──────────────────────────────────────────────────
await scrollTo('span', 'Pragma')
await shot('08-pragma')

// ── the settled market, and claiming without a key ──────────────────────────────
await page.goto(SITE + '#0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4',
  { waitUntil: 'networkidle', timeout: 120_000 })
await page.waitForTimeout(4000)
await shot('09-settled')
await scrollTo('span', 'The book')
await shot('10-settled-book')

// ── open a market ───────────────────────────────────────────────────────────────
await page.goto(SITE + 'create/', { waitUntil: 'networkidle', timeout: 120_000 })
await page.waitForTimeout(4000)
await shot('11-create')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.startsWith('BTC'))
  b?.click()
})
await page.waitForTimeout(900)
const strike = page.locator('input[inputmode="decimal"]').first()
if (await strike.count()) { await strike.fill('100000'); await page.waitForTimeout(1400) }
await shot('12-template')

// ── the rest of the site ────────────────────────────────────────────────────────
for (const [path, name] of [['portfolio/', '13-portfolio'], ['wallet/', '14-wallet'], ['how-it-works/', '15-how']]) {
  await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(3500)
  await shot(name)
}

writeFileSync(join(ROOT, 'src/data/rects.json'), JSON.stringify(RECTS, null, 2))
await browser.close()
console.log('done →', OUT)
