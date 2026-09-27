/* A look at the app the way he sees it: onboarding, three weeks of made-up
   site work, every main screen, then the phone writing its own brief.

     node scripts/tour-shots.mjs [outDir]      (default: scripts/)

   Uses the real Gemini key from the build (vite.config.ts), so the last shot
   shows a real brief. Screens only — nothing is asserted here; smoke.mjs is
   the test. */

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { join } from 'path'

const OUT = process.argv[2] || 'scripts'
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
await page.route('**/latest.json*', (r) => r.fulfill({ status: 404, body: '' }))

const tap = async (text, exact = false) => {
  const el = page.getByText(text, { exact }).first()
  await el.waitFor({ timeout: 5000 })
  await el.click()
  await page.waitForTimeout(350)
}
const home = async () => {
  await page.goto('http://localhost:5196/'); await page.waitForTimeout(900)
  for (let i = 0; i < 6 && await page.locator('.tour').count(); i++) {
    await page.locator('.tour-card .btn.primary').click(); await page.waitForTimeout(400)
  }
}
const shot = async (name, full = true) => {
  // The app scrolls inside its own container, so "full page" means a tall window.
  if (full) { await page.setViewportSize({ width: 390, height: 2200 }); await page.waitForTimeout(300) }
  await page.screenshot({ path: join(OUT, `tour-${name}.png`) })
  if (full) await page.setViewportSize({ width: 390, height: 844 })
  console.log('shot ' + name)
}

await page.goto('http://localhost:5196/')
await page.waitForTimeout(800)
await shot('00-welcome', false)
await tap('শুরু করি')
await page.locator('.pick').first().click(); await tap('এগিয়ে যান')
await page.locator('input.input').first().fill('বিমল'); await tap('এগিয়ে যান')
await shot('01-onboarding-what', false)
// whatever this screen asks (sites / shop / both), take the first answer
if (await page.getByText('এখন কোন কাজটা চলছে?').count() === 0) {
  await page.locator('.pick').last().click(); await tap('এগিয়ে যান')
}
await page.getByText('এখন কোন কাজটা চলছে?').waitFor({ timeout: 5000 })
await page.locator('input.input').first().fill('রামপুর বাড়ি')
await page.locator('input.input').nth(1).fill('2800000')
await tap('এগিয়ে যান')
await page.locator('input.input').nth(0).fill('রতন')
await page.locator('input.input').nth(1).fill('600')
await tap('+ আরও একজন')
await page.locator('input.input').nth(2).fill('সুকুমার')
await page.locator('input.input').nth(3).fill('550')
await tap('এগিয়ে যান')
await tap('হয়ে গেল')
await page.waitForTimeout(800)
// close the first-run tour
for (let i = 0; i < 6 && await page.locator('.tour').count(); i++) {
  await page.locator('.tour-card .btn.primary').click(); await page.waitForTimeout(500)
}
await shot('02-home-empty')

/* ---- three weeks of made-up work, written through the app's own store ---- */
await page.evaluate(async () => {
  const st = await import('/src/lib/store.ts')
  const s = st.getState()
  const job = s.masters.find((m) => m.kind === 'project')
  const men = s.masters.filter((m) => m.kind === 'worker')
  const items = s.masters.filter((m) => m.kind === 'item')
  const cement = items.find((i) => i.name_bn === 'সিমেন্ট')
  const rod = items.find((i) => i.name_bn === 'রড')
  const now = new Date().toISOString()
  const day = (ago) => {
    const d = new Date(Date.now() - ago * 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let n = 0
  const id = () => 'seed' + (++n) + Math.random().toString(36).slice(2, 6)
  await st.saveMaster({ ...job, area_sqft: 1400, start_date: day(45), plan_days: 180 })
  const shop = { id: id(), kind: 'party', name_bn: 'শর্মা ট্রেডার্স', ptype: 'supplier', terms_days: 15, phone: '', updated_at: now }
  const client = { id: id(), kind: 'party', name_bn: 'দত্ত বাবু', ptype: 'client', terms_days: 0, phone: '', updated_at: now }
  await st.saveMaster(shop); await st.saveMaster(client)
  await st.saveMaster({ id: id(), kind: 'bill', name_bn: 'দোকান ভাড়া', to_bn: 'নিতাই বাবু', amount: 6500, due_date: day(-2), repeat: 'monthly', personal: false, paid_on: '', note: '', updated_at: now })
  const es = []
  const base = (ago, batch) => ({ id: id(), batch, date: day(ago), project_id: job.id, created_at: now })
  for (let ago = 20; ago >= 1; ago--) {
    if (ago % 7 === 0) continue // Sundays off
    const b = 'b' + ago
    men.forEach((w, i) => {
      if (ago % 5 === i) return
      es.push({ ...base(ago, b), kind: 'attendance', worker_id: w.id, presence: 'full', days: 1, rate: w.rate, amount: w.rate, advance: ago === 6 && i === 0 ? 1000 : 0 })
    })
    if (ago % 3 === 0) es.push({ ...base(ago, b), kind: 'money', head_bn: 'চা-জলখাবার', dir: 'paid', amount: 150, party_id: '', mode: 'নগদ', note: '', personal: false, photo_id: '' })
    if (ago === 4) es.push({ ...base(ago, b), kind: 'money', head_bn: 'গাড়ি ভাড়া', dir: 'paid', amount: 3200, party_id: '', mode: 'নগদ', note: '', personal: false, photo_id: '' })
    es.push({ ...base(ago, b), kind: 'day', cash_counted: ago === 1 ? 21000 : null, cash_computed: ago === 1 ? 26400 : null, note: '' })
  }
  if (cement) es.push({ ...base(25, 'm1'), kind: 'stock', item_id: cement.id, dir: 'in', qty: 250, rate: 420, amount: 105000, party_id: shop.id, due_date: day(10), paid: false, photo_id: '' })
  if (rod) es.push({ ...base(9, 'm2'), kind: 'stock', item_id: rod.id, dir: 'in', qty: 2200, rate: 68, amount: 149600, party_id: shop.id, due_date: day(-6), paid: false, photo_id: '' })
  es.push({ ...base(30, 'g1'), kind: 'progress', stage_seq: 1, state: 'done', pct: 0 })
  es.push({ ...base(12, 'r1'), kind: 'money', head_bn: 'কাজের টাকা', dir: 'received', amount: 300000, party_id: client.id, mode: 'ব্যাংক', note: '', personal: false, photo_id: '' })
  await st.saveEntries(es)
})
await page.reload(); await page.waitForTimeout(1200)
for (let i = 0; i < 6 && await page.locator('.tour').count(); i++) {
  await page.locator('.tour-card .btn.primary').click(); await page.waitForTimeout(400)
}
await shot('03-home-local')

/* ---- the books ---- */
const books = page.getByText('দেখুন')
const nBooks = await books.count()
for (let i = 0; i < nBooks; i++) {
  await page.getByText('দেখুন').nth(i).click(); await page.waitForTimeout(600)
  await shot('04-book-' + i)
  await home()
}
await tap('সব কিছু').catch(() => {})
await shot('05-everything')
await home()

/* ---- the day wizard, first two screens ---- */
await tap('আজকের হিসাব').catch(() => {})
await shot('06-wizard-1', false)
await home()

/* ---- the phone writes its own brief ---- */
const t0 = Date.now()
const result = await page.evaluate(async () => {
  const ai = await import('/src/lib/aiBrief.ts')
  if (!ai.hasAiKey()) return 'NO KEY IN BUILD'
  const err = await ai.makePhoneBrief()
  const status = await ai.aiStatus()
  return (err || 'ok') + ' | ' + JSON.stringify(status)
})
console.log(`brief (${((Date.now() - t0) / 1000).toFixed(1)}s): ${result}`)
await page.reload(); await page.waitForTimeout(1500)
for (let i = 0; i < 6 && await page.locator('.tour').count(); i++) {
  await page.locator('.tour-card .btn.primary').click(); await page.waitForTimeout(400)
}
await shot('07-home-ai')

console.log(errors.length ? '\n' + errors.join('\n') : '\nno console errors')
await browser.close(); await server.close()
