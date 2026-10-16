/* Money coming in, old dues and credit — each scenario on a fresh phone.

   A phone already set up: one job (রায়বাড়ি, contract 10 lakh), ₹10,000 in hand
   from this morning, no men, no shop. What he writes here has to land in the
   job's received figure and, only when it is cash, in the cash in hand. */
import { chromium } from 'playwright'
import { createServer } from 'vite'

const PORT = 5197
const ORIGIN = `http://localhost:${PORT}/`
const server = await createServer({ server: { port: PORT } })
await server.listen()
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const log = []

const step = async (name, page, fn) => {
  try { await fn(); log.push('ok   ' + name) }
  catch (e) {
    log.push('FAIL ' + name + ' :: ' + String(e).split('\n')[0])
    try {
      await page.screenshot({ path: 'scripts/fail-' + name.replace(/\W+/g, '-') + '.png' })
      log.push('     screen: ' + (await page.locator('.app').innerText()).replace(/\n+/g, ' | ').slice(0, 300))
    } catch {}
  }
}

async function fresh(extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message))
  await page.goto(ORIGIN)
  await page.getByText('খাতাটা এবার ফোনে').waitFor({ timeout: 8000 })
  await page.evaluate(async (extra) => {
    const m = await import('/src/lib/store.ts')
    const bn = await import('/src/lib/bn.ts')
    await m.saveMaster({ id: 'p1', kind: 'project', name_bn: 'রায়বাড়ি', client_bn: '', ptype: 'বাড়ি', area_sqft: null, budget: 1000000, start_date: bn.isoDate(), plan_days: null, status: extra.jobStatus || 'active', updated_at: new Date().toISOString() })
    await m.saveSettings({ onboarded: true, toured: true, runs_shop: false, runs_sites: true, opening_cash: 10000, opening_date: bn.isoDate() })
  }, extra)
  await page.goto(ORIGIN)
  await page.locator('.headline').waitFor({ timeout: 6000 })
  return { ctx, page }
}

const tap = (page, text, exact = false) => page.getByText(text, { exact }).first().click()
const pad = async (page, digits) => { for (const d of digits) await page.locator('.pad button', { hasText: d }).first().click() }
/** Figures straight from the phone's own book. */
const book = (page) => page.evaluate(async () => {
  const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts')
  const s = m.getState()
  const p = s.masters.find((x) => x.id === 'p1')
  return {
    received: c.projectTotals(p, s.entries, m.stages(s)).received,
    cash: c.cashState(s.entries, s.settings.opening_cash, s.settings.opening_date).computed,
    rows: s.entries.filter((e) => e.kind === 'money').map((e) => ({ head: e.head_bn, dir: e.dir, amount: e.amount, mode: e.mode, project: e.project_id })),
  }
})
/** The evening, up to the money-received question. */
const toReceived = async (page) => {
  await tap(page, 'আজকের হিসাব')
  await page.getByText('কী মাল?').waitFor({ timeout: 4000 }); await tap(page, 'আজ মাল আসেনি')
  await page.getByText('কোনো মাল ফেরত এল?').waitFor({ timeout: 3000 }); await tap(page, 'কিছু ফেরত আসেনি')
  await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 }); await tap(page, 'আর কোনো খরচ নেই')
  await page.getByText('আজ কেউ টাকা দিয়েছেন?').waitFor({ timeout: 3000 })
}
/** From the money question to a saved day, agreeing with whatever the book expects in hand. */
const finishDay = async (page) => {
  await page.getByText('কাজ কতদূর?').waitFor({ timeout: 3000 }); await tap(page, 'এগিয়ে যান')
  await page.getByText('নিজের কোনো খরচ?').waitFor({ timeout: 3000 }); await page.getByText('না', { exact: true }).first().click()
  await page.getByText('দিনের শেষে হাতে কত?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
  await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
}

/* ---- B1: the evening question, in cash ---- */
{
  const { ctx, page } = await fresh()
  await step('evening: "আজ কেউ টাকা দিয়েছেন?" comes after the other expenses', page, async () => { await toReceived(page) })
  await step('evening: ₹5,000 in cash for the job is written down', page, async () => {
    await tap(page, 'হ্যাঁ', true)
    await page.getByText('কোন কাজের টাকা?').waitFor({ timeout: 3000 })
    await pad(page, ['৫', '০', '০', '০'])
    await tap(page, 'যোগ করুন', true)
    await page.getByText('আজ কেউ টাকা দিয়েছেন?').waitFor({ timeout: 3000 })
    await tap(page, 'এগিয়ে যান')
    await finishDay(page)
    const review = await page.locator('.scroll').first().innerText()
    if (!review.includes('টাকা পেলাম') || !review.includes('৫,০০০')) throw new Error('the review does not show the ₹5,000 received')
    await page.getByText('সেভ করুন').click()
    await page.getByText('আজকের হিসাব লেখা হল').waitFor({ timeout: 5000 })
    const b = await book(page)
    if (b.received !== 5000) throw new Error('job received is ' + b.received)
    if (b.cash !== 15000) throw new Error('cash in hand is ' + b.cash + ', not 15000')
    const r = b.rows.find((x) => x.dir === 'received')
    if (!r || r.head !== 'কাজের টাকা' || r.project !== 'p1' || r.mode !== 'নগদ') throw new Error('row: ' + JSON.stringify(r))
  })
  await ctx.close()
}

/* ---- B1: "না" writes nothing ---- */
{
  const { ctx, page } = await fresh()
  await step('evening: "না" moves on and writes nothing', page, async () => {
    await toReceived(page)
    await page.getByText('না', { exact: true }).first().click()
    await page.getByText('কাজ কতদূর?').waitFor({ timeout: 3000 })
    const d = await page.evaluate(async () => (await (await import('/src/lib/draft.ts')).loadDraft()))
    if ((d.recv || []).length) throw new Error('a received row was drafted')
  })
  await ctx.close()
}

/* ---- B1: with no live job there is no one to have paid for one ---- */
{
  const { ctx, page } = await fresh({ jobStatus: 'done' })
  await step('evening: with no live job the question is not asked', page, async () => {
    await tap(page, 'আজকের হিসাব')
    await page.getByText('নিজের কোনো খরচ?').waitFor({ timeout: 4000 })
    if (await page.getByText('আজ কেউ টাকা দিয়েছেন?').count()) throw new Error('asked with no live job')
  })
  await ctx.close()
}

/* ---- B2: "টাকা পেলাম" in হিসাব, by UPI ---- */
{
  const { ctx, page } = await fresh()
  await step('হিসাব: "টাকা পেলাম" by UPI counts for the job, not in the cash box', page, async () => {
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    await tap(page, 'টাকা পেলাম')
    await page.getByText('কোন কাজের টাকা?').waitFor({ timeout: 3000 })
    await pad(page, ['২', '০', '০', '০'])
    await tap(page, 'অনলাইনে (UPI)')
    await page.locator('.sheet .btn.primary').click()
    await page.waitForTimeout(400)
    const b = await book(page)
    if (b.received !== 2000) throw new Error('job received is ' + b.received)
    if (b.cash !== 10000) throw new Error('cash in hand moved to ' + b.cash)
    if (b.rows[0]?.mode !== 'UPI') throw new Error('stored mode is ' + b.rows[0]?.mode)
  })
  await ctx.close()
}

console.log(log.join('\n'))
await browser.close()
await server.close()
process.exit(log.some((l) => l.startsWith('FAIL') || l.startsWith('PAGEERROR')) ? 1 : 0)
