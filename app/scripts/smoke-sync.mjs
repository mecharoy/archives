/* App → Worker → D1 → summary, and back again.
   Runs the actual UI against the actual server, then wipes the phone and
   restores it from the server the way a replacement handset would. */

import { chromium } from 'playwright'
import { createServer } from 'vite'

const WORKER = 'http://localhost:8799'
const ADMIN = 'dev-admin-token-for-local-testing-only'

const log = []
let failed = 0
const step = async (name, fn) => {
  try { await fn(); log.push('ok   ' + name) }
  catch (e) {
    failed++
    log.push('FAIL ' + name + ' :: ' + String(e).split('\n')[0])
    try { log.push('     screen: ' + (await page.locator('.app').innerText()).replace(/\n+/g, ' | ').slice(0, 260)) } catch {}
  }
}
const eq = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: expected ${want}, got ${got}`)
}

// a household of its own, so this run cannot see the other tests' rows
const created = await fetch(WORKER + '/admin/households', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Smoke' }),
}).then((r) => r.json())
const DEVICE = created.device_token

const server = await createServer({
  server: { port: 5195 },
  define: {
    'import.meta.env.VITE_SYNC_ENDPOINT': JSON.stringify(WORKER),
    'import.meta.env.VITE_SYNC_TOKEN': JSON.stringify(DEVICE),
  },
})
await server.listen()

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  // the app asks for the brief before one exists; that 404 is expected
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push('CONSOLE: ' + m.text())
})

const tap = async (text, exact = false) => {
  const el = page.getByText(text, { exact }).first()
  await el.waitFor({ timeout: 5000 })
  await el.click()
}
const summary = () =>
  fetch(WORKER + '/summary', { headers: { Authorization: 'Bearer ' + DEVICE } }).then((r) => r.json())

await page.goto('http://localhost:5195/')
await page.waitForTimeout(800)

await step('the built-in endpoint is picked up with nothing typed', async () => {
  const s = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sitekhata')
    r.onsuccess = () => {
      const q = r.result.transaction('kv').objectStore('kv').get('settings')
      q.onsuccess = () => res(q.result ? q.result.v : null)
      q.onerror = () => res(null)
    }
  }))
  // settings are only written once something changes; the defaults are what matter
  const shown = await page.locator('body').innerText()
  if (!shown.includes('খাতাটা এবার ফোনে')) throw new Error('did not reach onboarding')
  if (s && s.endpoint === '') throw new Error('stored settings blanked the built-in endpoint')
})

await step('onboarding', async () => {
  await tap('শুরু করি')
  await page.locator('input.input').first().fill('রামপুর বাড়ি')
  await page.locator('input.input').nth(1).fill('2800000')
  await tap('এগিয়ে যান')
  await page.locator('input.input').nth(0).fill('রতন')
  await page.locator('input.input').nth(1).fill('600')
  await page.locator('.input.num').last().fill('52000')
  await tap('হয়ে গেল')
  await page.getByText('আজকের হিসাব').first().waitFor({ timeout: 6000 })
})

await step('a full day is entered', async () => {
  await tap('আজকের হিসাব')
  await page.locator('.pick').nth(0).click()
  await tap('এগিয়ে যান')
  await tap('এগিয়ে যান')
  await tap('হ্যাঁ')
  await page.getByText('সিমেন্ট', { exact: true }).first().click()
  for (const d of ['১', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  for (const d of ['৪', '১', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('হ্যাঁ, দিয়েছি')
  await page.getByText('যোগ করুন', { exact: true }).last().click()
  await tap('এগিয়ে যান')
  await page.getByText('না', { exact: true }).first().click()
  await page.getByText('অর্ধেক হয়েছে').first().click()
  await page.getByText('হ্যাঁ, এটাই আছে').click()
  await tap('সেভ করুন')
  await page.getByText('আজকের হিসাব লেখা হল').waitFor({ timeout: 6000 })
})

await step('the outbox drains to the server on its own', async () => {
  for (let i = 0; i < 40; i++) {
    const pending = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('sitekhata')
      r.onsuccess = () => {
        const q = r.result.transaction('outbox').objectStore('outbox').getAll()
        q.onsuccess = () => res(q.result.length)
      }
    }))
    if (pending === 0) return
    await page.waitForTimeout(500)
  }
  throw new Error('outbox never emptied')
})

await step('the server computed the same day the phone did', async () => {
  const s = await summary()
  eq(s.ok, true, 'ok')
  eq(s.projects.length, 1, 'projects')
  const p = s.projects[0]
  eq(p.name_bn, 'রামপুর বাড়ি', 'name')
  eq(p.labour, 600, 'labour')
  eq(p.material, 4100, 'material')
  eq(p.cost, 4700, 'cost')
  eq(p.pct_done, 4, 'pct_done (stage 1 of 8, half of weight 8)')
  eq(s.business.cash_counted, 47300, 'cash counted')
  eq(s.business.entries_last_3_days, 1, 'entries')
})

await step('a correction reaches the server as a mirrored row', async () => {
  await page.locator('.tile', { hasText: 'পুরোনো হিসাব' }).click()
  await page.locator('.pick').first().click()
  await page.locator('.sheet .iconbtn').first().click()
  await page.getByText('বাতিল করুন').click()
  await page.waitForTimeout(2500)
  const s = await summary()
  if (s.projects[0].labour === 600 && s.projects[0].material === 4100) {
    throw new Error('nothing was reversed on the server')
  }
})

await step('the nightly brief reaches the phone from the same server', async () => {
  await fetch(WORKER + '/brief?household=' + created.household.id, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generated_at: new Date().toISOString(),
      headline_bn: 'রাতের হিসাব এসেছে।',
      cards: [{ label_bn: 'হাতে টাকা', value: '₹47,300', status: 'ok' }],
    }),
  })
  await page.goto('http://localhost:5195/')
  await page.waitForTimeout(2500)
  const body = await page.locator('.scroll').first().innerText()
  if (!body.includes('রাতের হিসাব এসেছে।')) throw new Error('headline from the server not shown')
})

await step('a wiped phone restores itself from the server', async () => {
  await page.evaluate(() => new Promise((res) => {
    const del = indexedDB.deleteDatabase('sitekhata')
    del.onsuccess = del.onerror = del.onblocked = () => res(null)
  }))
  await page.goto('http://localhost:5195/')
  await page.waitForTimeout(900)
  await page.getByText('খাতাটা এবার ফোনে').waitFor({ timeout: 5000 })   // fresh install
  await tap('শুরু করি')
  await page.locator('input.input').first().fill('x')
  await tap('এগিয়ে যান')
  await tap('হয়ে গেল')
  await page.waitForTimeout(900)

  await page.locator('.topbar .iconbtn').nth(1).click()
  await tap('অনলাইন খাতা')
  const endpointShown = await page.locator('input.input').first().inputValue()
  if (!endpointShown) throw new Error('the built-in endpoint did not survive a wipe')
  await page.getByText('অনলাইন থেকে ফিরিয়ে আনুন').first().click()
  // scoped to the sheet: the button behind it carries the same words
  await page.locator('.sheet .btn.primary').click()
  await page.getByText('লাইন ফিরে এসেছে').waitFor({ timeout: 15000 })

  await page.goto('http://localhost:5195/')
  await page.waitForTimeout(1200)

  const back = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sitekhata')
    r.onsuccess = () => {
      const tx = r.result.transaction(['masters', 'entries'])
      const m = tx.objectStore('masters').getAll()
      const e = tx.objectStore('entries').getAll()
      tx.oncomplete = () => res({
        projects: m.result.filter((x) => x.kind === 'project').map((x) => x.name_bn),
        workers: m.result.filter((x) => x.kind === 'worker').map((x) => x.name_bn),
        attendance: e.result.filter((x) => x.kind === 'attendance').length,
        stock: e.result.filter((x) => x.kind === 'stock').length,
      })
    }
  }))
  if (!back.projects.includes('রামপুর বাড়ি')) throw new Error('job not restored: ' + JSON.stringify(back.projects))
  if (!back.workers.includes('রতন')) throw new Error('worker not restored: ' + JSON.stringify(back.workers))
  if (back.attendance < 2) throw new Error('wage row and its reversal not restored: ' + back.attendance)
  if (back.stock < 1) throw new Error('purchase not restored')

  // and the restored rows must be readable by the screens, not just present
  await page.locator('.tile', { hasText: 'পুরোনো হিসাব' }).click()
  await page.waitForTimeout(600)
  const hist = await page.locator('.scroll').first().innerText()
  if (!hist.includes('আজ')) throw new Error('restored day not listed in history')
})

console.log(log.join('\n'))
console.log('\n--- console errors ---')
console.log(errors.length ? errors.slice(0, 10).join('\n') : '(none)')
await browser.close()
await server.close()
process.exit(failed || errors.length ? 1 : 0)
