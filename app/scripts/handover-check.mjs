/* Handover checks: the device key is pasted on the phone, never built in.
   A pretend Worker accepts one key; each scenario gets a fresh browser profile. */
import { chromium } from 'playwright'
import { createServer } from 'vite'

const PORT = 5198
const ORIGIN = `http://localhost:${PORT}/`
const WORKER = 'https://worker.test'
const GOOD = 'handover-good-token'
const server = await createServer({ server: { port: PORT } })
await server.listen()
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const log = []
let posted = 0

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.route(WORKER + '/**', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const j = (status, body) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (u.pathname === '/pull') {
      if (req.headers()['authorization'] !== 'Bearer ' + GOOD) return j(401, { ok: false, error: 'token' })
      return j(200, { ok: true, tables: { Projects: [['p1', 'দত্তবাড়ি']], Workers: [], Parties: [], Day: [], Attendance: [], Stock: [], Money: [], Bills: [] } })
    }
    if (u.pathname === '/rows') {
      posted++
      const body = JSON.parse(req.postData() || '{}')
      if (body.token !== GOOD) return j(401, { ok: false, error: 'token' })
      return j(200, { ok: true, accepted: (body.rows || []).map((r) => r.id), rejected: [] })
    }
    return j(404, { ok: false, error: 'not found' })
  })
  await page.goto(ORIGIN)
  await page.getByText('খাতাটা এবার ফোনে').waitFor({ timeout: 8000 })
  return { ctx, page }
}

const step = async (name, fn) => {
  try { await fn(); log.push('ok   ' + name) }
  catch (e) { log.push('FAIL ' + name + ' :: ' + String(e).split('\n')[0]) }
}
/* Run a function inside the page with the store and sync modules. The function
   is passed as source, so it must not close over anything in this file. */
const store = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const m = await import('/src/lib/store.ts'); const s = await import('/src/lib/sync.ts')
  return (0, eval)(src)(m, s, a)
}, [fn.toString(), arg])

/* ---- 1. no key: rows wait, nothing is posted, the message is calm ---- */
{
  const { ctx, page } = await fresh()
  await step('no key: sync posts nothing and says the key is missing', async () => {
    await store(page, async (m) => { await m.saveSettings({ endpoint: 'https://worker.test', token: '' }) })
    await store(page, async (m) => { await m.queue([{ tab: 'Day', mode: 'append', values: ['handover-row'] }]) })
    posted = 0
    const r = await store(page, async (m, s) => s.flush(true))
    if (posted !== 0) throw new Error('posted ' + posted + ' times with no key')
    if (r.error !== 'অনলাইন খাতার চাবি বসানো নেই') throw new Error('wrong message: ' + r.error)
    const left = await store(page, async (m) => m.getState().outbox.length)
    if (left < 1) throw new Error('the row left the outbox')
  })
  await step('no key: a row written before the key goes up after it is pasted', async () => {
    await store(page, async (m) => { await m.saveSettings({ token: 'handover-good-token' }) })
    const r = await store(page, async (m, s) => s.flush(true))
    if (r.error) throw new Error('error after paste: ' + r.error)
    const left = await store(page, async (m) => m.getState().outbox.filter((x) => x.rejected).length)
    if (left) throw new Error(left + ' rows marked refused')
  })
  await ctx.close()
}

/* ---- 2. Settings hides the key ---- */
{
  const { ctx, page } = await fresh()
  await step('settings: the key box hides what is typed', async () => {
    await store(page, async (m) => { await m.saveSettings({ onboarded: true, toured: true, endpoint: 'https://worker.test', token: 'handover-good-token' }) })
    await page.goto(ORIGIN)
    await page.getByLabel('সেটিংস').click()
    await page.getByText('অনলাইন খাতা').first().click()
    const box = page.locator('.field', { hasText: 'গোপন টোকেন' }).locator('input')
    if ((await box.getAttribute('type')) !== 'password') throw new Error('the key is shown in plain text')
    await page.getByRole('button', { name: 'দেখান' }).click()
    if ((await box.getAttribute('type')) !== 'text') throw new Error('দেখান did not show it')
  })
  await ctx.close()
}

console.log(log.join('\n'))
await browser.close()
await server.close()
process.exit(log.some((l) => l.startsWith('FAIL')) ? 1 : 0)
