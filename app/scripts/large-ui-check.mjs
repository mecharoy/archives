/* The big ledger, on the actual screens, on a slowed-down computer.

   large-check.mjs times the arithmetic. This loads a real big ledger into the app's own storage
   (IndexedDB), opens it in a phone-sized browser with the CPU slowed 4x (a cheap Android phone is
   about that), and times what he would feel: the app opening, each book opening, the screen
   redrawing after a change, and saving a day. It also reports the longest single stall, because a
   screen that freezes for a second feels broken however fast it is on average.

   LARGE_UI_EVENTS=6000,12000 LARGE_UI_SLOW=4 npm run large:ui */

process.env.TZ = 'Asia/Kolkata'

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { loadApp } from './_app.mjs'
import { demoData } from './_demo.mjs'

const SIZES = (process.env.LARGE_UI_EVENTS || '1500,6000,12000').split(',').map(Number)
const SLOW = Number(process.env.LARGE_UI_SLOW || 4)
const PORT = 5233

const app = await loadApp()
const today = app.bn.isoDate()

const server = await createServer({ server: { port: PORT }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})

const rows = []
for (const events of SIZES) {
  const demo = demoData(app, today, events)
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cdp = await ctx.newCDPSession(page)

  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForSelector('body')
  // The ledger goes into IndexedDB in pieces, the way a phone accumulates it.
  await page.evaluate(async ({ masters, settings, brief }) => {
    const db = await import('/src/lib/db.ts')
    for (const s of ['masters', 'entries', 'outbox', 'kv']) await db.dbClear(s)
    await db.dbPutMany('masters', masters)
    await db.kvSet('settings', settings)
    await db.kvSet('brief', brief)
    await db.kvSet('brief_fetched_at', new Date().toISOString())
  }, { masters: demo.masters, brief: demo.brief, settings: { onboarded: true, toured: true, lang: 'bn', theme: 'light', text_scale: 1, remind: 'off' } })
  for (let i = 0; i < demo.entries.length; i += 3000) {
    await page.evaluate(async (chunk) => { await (await import('/src/lib/db.ts')).dbPutMany('entries', chunk) }, demo.entries.slice(i, i + 3000))
  }

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW })
  await page.addInitScript(() => {
    window.__longest = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longest = Math.max(window.__longest, e.duration) }).observe({ entryTypes: ['longtask'] })
  })

  const row = { rows: demo.entries.length }
  // opening the app
  let t = Date.now()
  await page.reload()
  await page.waitForSelector('.hero', { timeout: 120000 })
  row.open = Date.now() - t

  // opening each book from the home screen
  const open = async (name, click) => {
    const t0 = Date.now()
    await click()
    await page.waitForFunction(() => document.querySelector('.topbar h1'), null, { timeout: 120000 })
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    row[name] = Date.now() - t0
  }
  await open('work', () => page.locator('[data-tour="books"] > *').nth(0).click())
  await page.reload(); await page.waitForSelector('.hero')
  await open('shop', () => page.locator('[data-tour="books"] > *').nth(1).click())
  await page.reload(); await page.waitForSelector('.hero')
  await open('money', () => page.locator('[data-tour="books"] > *').nth(2).click())
  await page.reload(); await page.waitForSelector('.hero')
  await open('history', async () => { await page.locator('[data-tour="all"]').click(); await page.locator('.tile').nth(13).click() })

  // the home screen drawing itself again after something small changes (every sync does this)
  await page.reload(); await page.waitForSelector('.hero')
  row.redraw = await page.evaluate(async () => {
    const m = await import('/src/lib/store.ts')
    const t0 = performance.now()
    m.setState({ sync_error: 'x' })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return performance.now() - t0
  })

  // saving a day: the wizard's own builder, written through the store
  row.save = await page.evaluate(async () => {
    const store = await import('/src/lib/store.ts')
    const draft = await import('/src/lib/draft.ts')
    const s = store.getState()
    const p = s.masters.find((m) => m.kind === 'project')
    const w = s.masters.find((m) => m.kind === 'worker')
    const d = draft.newDraft(undefined, p.id)
    d.att = { [w.id]: { presence: 'full', rate: 700, amount: 700, advance: 0 } }
    const t0 = performance.now()
    await store.saveEntries(draft.buildEntries(d))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return performance.now() - t0
  })
  row.longest = await page.evaluate(() => window.__longest)
  row.errors = errors.length
  rows.push(row)
  await ctx.close()
}

await browser.close()
await server.close()

const f = (x) => String(Math.round(x)).padStart(8)
console.log(`milliseconds with the CPU slowed ${SLOW}x:`)
console.log('    rows' + ['open', 'work', 'shop', 'money', 'history', 'redraw', 'save day', 'worst stall'].map((h) => h.padStart(12)).join(''))
for (const r of rows) console.log(String(r.rows).padStart(8) + [r.open, r.work, r.shop, r.money, r.history, r.redraw, r.save, r.longest].map((x) => f(x).padStart(12)).join('') + (r.errors ? `   ${r.errors} page errors` : ''))

// Judged by the shape, and by a stall he would notice as a freeze.
const first = rows[0], last = rows[rows.length - 1]
const slope = (k) => (first[k] > 40 ? Math.log(last[k] / first[k]) / Math.log(last.rows / first.rows) : 0)
let fail = 0
for (const k of ['open', 'work', 'shop', 'money', 'history', 'redraw', 'save']) {
  const s = slope(k)
  const ok = s <= 1.5
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k}: time grows in step with the ledger (slope ${s.toFixed(2)}; limit 1.5)`)
}
const stallOk = last.longest < 3000
if (!stallOk) fail++
console.log(`${stallOk ? 'ok  ' : 'FAIL'} the worst stall at ${last.rows} rows on a ${SLOW}x slower CPU is ${Math.round(last.longest)} ms (limit 3000)`)
const errOk = rows.every((r) => !r.errors)
if (!errOk) fail++
console.log(`${errOk ? 'ok  ' : 'FAIL'} no page errors`)
process.exit(fail ? 1 : 0)
