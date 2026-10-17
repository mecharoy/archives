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
    if (extra.shop) {
      const now = new Date().toISOString()
      await m.saveMaster({ id: 'i1', kind: 'item', name_bn: 'পাইপ', unit_bn: 'পিস', last_rate: 100, active: true, updated_at: now })
      await m.saveMaster({ id: 'c1', kind: 'party', name_bn: 'হালদার', ptype: 'client', terms_days: 0, phone: '', updated_at: now })
      await m.saveMaster({ id: 's1', kind: 'party', name_bn: 'শর্মা', ptype: 'supplier', terms_days: 15, phone: '', updated_at: now })
    }
    await m.saveSettings({ onboarded: true, toured: true, runs_shop: !!extra.shop, runs_sites: true, opening_cash: 10000, opening_date: bn.isoDate() })
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

/* ---- B5, B9: every credit sale and purchase gets a date; a credit purchase needs a supplier ---- */
const lastStock = (page, dir) => page.evaluate(async (dir) => {
  const m = await import('/src/lib/store.ts'); const bn = await import('/src/lib/bn.ts')
  const e = m.getState().entries.filter((x) => x.kind === 'stock' && x.dir === dir).pop()
  return { due: e?.due_date, party: e?.party_id, today: bn.isoDate(), in7: bn.addDays(bn.isoDate(), 7), in15: bn.addDays(bn.isoDate(), 15) }
}, dir)
const toWho = async (page, tile, qty, rate) => {
  await tap(page, tile)
  await tap(page, 'পাইপ', true)
  await pad(page, qty); await tap(page, 'এগিয়ে যান')
  await pad(page, rate); await tap(page, 'এগিয়ে যান')
}
{
  const { ctx, page } = await fresh({ shop: true })
  await step('shop: a customer can be given credit days, like a supplier', page, async () => {
    await page.locator('.bookcard', { hasText: 'মজুত' }).first().click()
    await toWho(page, 'মাল ধরে বিক্রি', ['২'], ['১', '০', '০'])
    await tap(page, '+ নতুন', true)
    await page.getByText('কত দিনে টাকা দেয় (না জানলে ০)').waitFor({ timeout: 3000 })
    await page.locator('.sheet .iconbtn, .sheet [aria-label="বন্ধ করুন"]').first().click().catch(() => page.keyboard.press('Escape'))
  })
  await step('shop: a credit sale to a customer with no agreed days falls due in a week', page, async () => {
    await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
    await page.locator('.bookcard', { hasText: 'মজুত' }).first().click()
    await toWho(page, 'মাল ধরে বিক্রি', ['২'], ['১', '০', '০'])
    await tap(page, 'হালদার', true)
    await tap(page, 'না, বাকি')
    await page.getByText('কবে দেবে?').waitFor({ timeout: 3000 })
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    const r = await lastStock(page, 'sale')
    if (r.due !== r.in7) throw new Error('due ' + r.due + ', not ' + r.in7)
  })
  await step('shop: a credit purchase cannot be saved without a supplier', page, async () => {
    await toWho(page, 'মাল এসেছে', ['৫'], ['৮', '০'])
    await tap(page, 'না, বাকি')
    if (await page.locator('.actionbar .btn.primary').isEnabled()) throw new Error('a credit purchase with no supplier could be saved')
  })
  await step("shop: with the supplier picked it falls due on the supplier's own days", page, async () => {
    await tap(page, 'শর্মা', true)
    await page.getByText('কবে দিতে হবে?').waitFor({ timeout: 3000 })
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    const r = await lastStock(page, 'in')
    if (r.party !== 's1' || r.due !== r.in15) throw new Error('party ' + r.party + ', due ' + r.due + ', not ' + r.in15)
  })
  await ctx.close()
}

const lastRow = (page, dir) => page.evaluate(async (dir) => {
  const m = await import('/src/lib/store.ts'); const bn = await import('/src/lib/bn.ts')
  const e = m.getState().entries.filter((x) => x.kind === 'stock' && x.dir === dir).pop()
  return e ? { ...e, today: bn.isoDate(), ago60: bn.addDays(bn.isoDate(), -60), in15: bn.addDays(bn.isoDate(), 15) } : null
}, dir)
const listText = (page) => page.locator('.scroll').first().innerText()

/* ---- B6, S2: a sale by its total alone, and the shop's two ways of selling named ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await step('shop: the two ways of selling say what they do', page, async () => {
    await page.locator('.bookcard', { hasText: 'মজুত' }).first().click()
    await page.getByText('মাল ধরে বিক্রি').first().waitFor({ timeout: 3000 })
    await page.getByText('শুধু টাকার হিসাব — বাকিতে দিলাম').first().waitFor({ timeout: 3000 })
  })
  await step('shop: "বাকিতে দিলাম" ₹800 to a customer, due in a fortnight, moves no stock', page, async () => {
    const before = await page.evaluate(async () => { const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts'); const s = m.getState(); return JSON.stringify(c.shopStock(s.entries, m.items(s))) })
    await tap(page, 'শুধু টাকার হিসাব — বাকিতে দিলাম')
    if (await page.locator('.actionbar .btn.primary').isEnabled()) throw new Error('could be saved with no customer and no amount')
    await tap(page, 'হালদার', true)
    await pad(page, ['৮', '০', '০'])
    await tap(page, '১৫ দিন', true)
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(500)
    const r = await lastRow(page, 'sale')
    if (!r || r.amount !== 800 || r.item_id !== '' || r.qty !== 0 || r.paid !== false || r.party_id !== 'c1' || r.due_date !== r.in15) throw new Error('row: ' + JSON.stringify(r))
    const after = await page.evaluate(async () => { const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts'); const s = m.getState(); return JSON.stringify(c.shopStock(s.entries, m.items(s))) })
    if (after !== before) throw new Error('the shelf changed: ' + before + ' → ' + after)
    await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    await tap(page, 'টাকা দেওয়া-নেওয়া')
    const txt = await listText(page)
    if (!txt.includes('হালদার') || !txt.includes('৮০০')) throw new Error('পাবেন does not show ₹800 from হালদার')
  })
  await ctx.close()
}

/* ---- B4: old dues from the paper khata ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await step('old dues: "উনি আমাকে দেবেন" ₹5,000 from a new person, since two months', page, async () => {
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    await tap(page, 'টাকা দেওয়া-নেওয়া')
    await tap(page, '+ পুরোনো বাকি')
    await tap(page, 'উনি আমাকে দেবেন')
    await tap(page, '+ নতুন', true)
    await page.locator('.sheet input.input').first().fill('পুরোনো খদ্দের')
    await pad(page, ['৫', '০', '০', '০'])
    const ago60 = await page.evaluate(() => import('/src/lib/bn.ts').then((bn) => bn.addDays(bn.isoDate(), -60)))
    await page.locator('.sheet input[type=date]').fill(ago60)
    await tap(page, '১৫ দিন', true)
    await page.locator('.sheet .btn.primary').last().click()
    await page.waitForTimeout(500)
    const r = await lastRow(page, 'opening_get')
    if (!r) throw new Error('no old-balance row')
    if (r.amount !== 5000 || r.item_id !== '' || r.qty !== 0 || r.paid !== false) throw new Error('row: ' + JSON.stringify(r))
    if (r.date !== r.ago60 || r.due_date !== r.in15) throw new Error('since ' + r.date + ' / due ' + r.due_date)
    const txt = await listText(page)
    if (!txt.includes('পুরোনো খদ্দের') || !txt.includes('৫,০০০')) throw new Error('পাবেন does not show ₹5,000: ' + txt.slice(0, 200))
  })
  await step('old dues: ₹2,000 paid against it leaves ₹3,000', page, async () => {
    await page.getByText('পুরোনো খদ্দের').first().click()
    await pad(page, ['২', '০', '০', '০'])
    await page.locator('.sheet .btn.primary').click()
    await page.waitForTimeout(500)
    const txt = await listText(page)
    if (!txt.includes('৩,০০০')) throw new Error('not ₹3,000 left: ' + txt.slice(0, 200))
  })
  await step('old dues: "আমি ওনাকে দেব" ₹1,200 to a shop shows in দেবেন', page, async () => {
    await tap(page, '+ পুরোনো বাকি')
    await tap(page, 'আমি ওনাকে দেব')
    await tap(page, 'শর্মা', true)
    await pad(page, ['১', '২', '০', '০'])
    await page.locator('.sheet .btn.primary').last().click()
    await page.waitForTimeout(500)
    const r = await lastRow(page, 'opening_owe')
    if (!r || r.amount !== 1200 || r.party_id !== 's1' || r.due_date !== r.in15) throw new Error('row: ' + JSON.stringify(r))
    const txt = await listText(page)
    if (!txt.includes('যাদের দিতে হবে') || !txt.includes('১,২০০')) throw new Error('দেবেন does not show ₹1,200')
  })
  await step("old dues: they are not this month's spending", page, async () => {
    await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    const spend = await page.locator('.stat', { hasText: 'এ মাসের খরচ' }).innerText()
    if (!spend.includes('₹০')) throw new Error('month spend: ' + spend)
    const txt = await listText(page)
    if (!txt.includes('পুরোনো বাকি')) throw new Error('the dues list does not name the old balance')
  })
  await ctx.close()
}

/* ---- B3: the cash count stops blaming him ---- */
const toCount = async (page, counted) => {
  await toReceived(page)
  await page.getByText('না', { exact: true }).first().click()
  await page.getByText('কাজ কতদূর?').waitFor({ timeout: 3000 }); await tap(page, 'এগিয়ে যান')
  await page.getByText('নিজের কোনো খরচ?').waitFor({ timeout: 3000 }); await page.getByText('না', { exact: true }).first().click()
  await page.getByText('দিনের শেষে হাতে কত?').waitFor({ timeout: 3000 })
  await tap(page, 'না, গুনে বলছি')
  await pad(page, counted)
  await page.locator('.actionbar .btn.primary').click()
  await page.waitForTimeout(300)
}
{
  const { ctx, page } = await fresh()
  await step('cash: ₹3,000 more than the book offers to write the money received', page, async () => {
    await toCount(page, ['১', '৩', '০', '০', '০'])
    if (!(await page.getByText('টাকা পেয়েছি — লিখে দিন').count())) throw new Error('no offer to write the money in')
    if (await page.getByText('কোনো খরচ লিখতে ভুলে গেছেন কি?').count()) throw new Error('asked about a forgotten expense when he has MORE')
    await tap(page, 'টাকা পেয়েছি — লিখে দিন')
    await page.getByText('আজ কেউ টাকা দিয়েছেন?').waitFor({ timeout: 3000 })
  })
  await ctx.close()
}
{
  const { ctx, page } = await fresh()
  await step('cash: ₹3,000 less than the book asks about a forgotten expense', page, async () => {
    await toCount(page, ['৭', '০', '০', '০'])
    if (!(await page.getByText('কোনো খরচ লিখতে ভুলে গেছেন কি?').count())) throw new Error('no question about a forgotten expense')
    if (await page.getByText('টাকা পেয়েছি — লিখে দিন').count()) throw new Error('offered money received when he has LESS')
  })
  await ctx.close()
}

console.log(log.join('\n'))
await browser.close()
await server.close()
process.exit(log.some((l) => l.startsWith('FAIL') || l.startsWith('PAGEERROR')) ? 1 : 0)
