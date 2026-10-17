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
  await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 }); await tap(page, 'আর কোনো খরচ নেই')
  await page.getByText('আজ কেউ টাকা দিয়েছেন?').waitFor({ timeout: 3000 })
}
/** From the money question to a saved day, agreeing with whatever the book expects in hand. */
const finishDay = async (page) => {
  await page.getByText('আর কিছু?').waitFor({ timeout: 3000 }); await page.locator('.actionbar .btn.primary').click()
  await page.getByText('দিনের শেষে হাতে কত?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
  await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
}

/* ---- D1: text size that works ---- */
{
  const { ctx, page } = await fresh()
  const titlePx = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.topbar h1')).fontSize))
  await step('text: a new install is large, and every size follows the setting', page, async () => {
    const big = await titlePx()
    if (Math.abs(big - 16 * 1.12 * 1.12) > 0.5) throw new Error('home title is ' + big + 'px, not about 20px')
    await page.evaluate(async () => (await import('/src/lib/store.ts')).saveSettings({ text_scale: 1.26 }))
    await page.waitForTimeout(200)
    const bigger = await titlePx()
    if (!(bigger > big + 1)) throw new Error('আরও বড় did not grow the title: ' + bigger)
  })
  await step('text: the page can be pinched to zoom', page, async () => {
    const vp = await page.evaluate(() => document.querySelector('meta[name=viewport]').getAttribute('content'))
    if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?!\d)/.test(vp)) throw new Error('zoom is blocked: ' + vp)
  })
  await ctx.close()
}

/* ---- D2, D3: the evening in eight screens, a hub for the rest, and back to review ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await page.evaluate(async () => {
    const m = await import('/src/lib/store.ts'); const seed = await import('/src/lib/seed.ts')
    await seed.seedHouse([])
    const p = m.getState().masters.find((x) => x.id === 'p1')
    await m.saveMaster({ ...p, ptype: seed.HOUSE })
    await m.saveMaster({ id: 'w1', kind: 'worker', name_bn: 'রতন', rate: 600, phone: '', active: true, updated_at: new Date().toISOString() })
  })
  await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
  await step('evening: a man, a job and a shop make eight screens', page, async () => {
    await tap(page, 'আজকের হিসাব')
    await page.getByText('আজ কে কে এসেছে?').waitFor({ timeout: 4000 })
    const count = await page.locator('.stepcount').innerText()
    if (!count.includes('/ ৮')) throw new Error('step counter reads ' + count)
  })
  await step('evening: আর কিছু? opens কাজ এগোল and comes back to itself, ticked', page, async () => {
    await page.locator('.pick').first().click(); await tap(page, 'এগিয়ে যান')
    await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 }); await tap(page, 'এগিয়ে যান')
    await page.getByText('কী মাল?').waitFor({ timeout: 3000 }); await tap(page, 'আজ মাল আসেনি')
    await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 }); await tap(page, 'আর কোনো খরচ নেই')
    await page.getByText('আজ কেউ টাকা দিয়েছেন?').waitFor({ timeout: 3000 }); await page.getByText('না', { exact: true }).first().click()
    await page.getByText('আর কিছু?').waitFor({ timeout: 3000 })
    await tap(page, 'কাজ এগোল')
    await page.getByText('কাজ কতদূর?').waitFor({ timeout: 3000 })
    await page.getByText('অর্ধেক হয়েছে').first().click()
    await page.getByText('আর কিছু?').waitFor({ timeout: 3000 })
    if (!(await page.locator('.pick.on', { hasText: 'কাজ এগোল' }).count())) throw new Error('কাজ এগোল is not ticked')
  })
  await step("evening: Back inside a hub step returns to the hub, not out of the day", page, async () => {
    await tap(page, 'নিজের খরচ')
    await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
    await page.evaluate(() => import('/src/lib/back.ts').then((m) => m.goBack()))
    await page.getByText('আর কিছু?').waitFor({ timeout: 3000 })
  })
  await step('evening: from the hub on to the cash count, then review', page, async () => {
    await page.locator('.actionbar .btn.primary').click()
    await page.getByText('দিনের শেষে হাতে কত?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
    await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
  })
  await step('evening: a jump from review comes back to review', page, async () => {
    // মজুরি opens who came, then their wages (one thing), then straight back — not on through material.
    await page.locator('.review-row', { hasText: 'মজুরি' }).first().click()
    await page.getByText('আজ কে কে এসেছে?').waitFor({ timeout: 3000 }); await tap(page, 'এগিয়ে যান')
    await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 }); await tap(page, 'এগিয়ে যান')
    await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
    await page.locator('.review-row', { hasText: 'অন্য খরচ' }).first().click()
    await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 }); await tap(page, 'আর কোনো খরচ নেই')
    await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
  })
  await ctx.close()
}
{
  const { ctx, page } = await fresh()
  await step('evening: a day half-written by the old build opens on the first screen with nothing lost', page, async () => {
    await page.evaluate(async () => {
      const d = await import('/src/lib/draft.ts')
      const old = { ...d.newDraft(), project_id: 'p1', step: 3, exps: [{ key: 'x', head_bn: 'চা-জলখাবার', amount: 120, mode: 'নগদ', note: '', photo_id: '' }] }
      delete old.at
      await d.saveDraft(old)
    })
    await tap(page, 'আজকের হিসাব')
    await page.getByText('কী মাল?').waitFor({ timeout: 4000 })
    const kept = await page.evaluate(async () => ((await (await import('/src/lib/draft.ts')).loadDraft()) || {}).exps?.length)
    if (kept !== 1) throw new Error('the expense typed before is gone')
  })
  await ctx.close()
}

/* ---- D4: nothing he typed is lost by accident ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await step('sheet: an empty sheet closes on a tap outside it', page, async () => {
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    await tap(page, 'পুরোনো বাকি', true)
    await page.locator('.sheet').waitFor({ timeout: 3000 })
    await page.mouse.click(12, 12)
    await page.waitForTimeout(300)
    if (await page.locator('.sheet').count()) throw new Error('the empty sheet stayed open')
  })
  await step('sheet: a sheet with a name typed in stays open on a stray tap', page, async () => {
    await tap(page, 'পুরোনো বাকি', true)
    await tap(page, '+ নতুন', true)
    await page.locator('.sheet input.input').first().fill('নাম লেখা হয়েছে')
    await page.mouse.click(12, 12)
    await page.waitForTimeout(300)
    if (!(await page.locator('.sheet').count())) throw new Error('the sheet with typing in it closed')
  })
  await ctx.close()
}
{
  const { ctx, page } = await fresh()
  await step('evening: once an expense is written, না is no longer offered', page, async () => {
    await tap(page, 'আজকের হিসাব')
    await page.getByText('কী মাল?').waitFor({ timeout: 4000 }); await tap(page, 'আজ মাল আসেনি')
    await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
    await page.locator('.chips button').first().click()
    await pad(page, ['১', '২', '০'])
    await tap(page, 'যোগ করুন', true)
    await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 })
    if (await page.getByText('না', { exact: true }).count()) throw new Error('না is still offered beside a written expense')
  })
  await ctx.close()
}

/* ---- D7: a calm home screen, and a help button ---- */
{
  const { ctx, page } = await fresh()
  await page.evaluate(async () => (await import('/src/lib/store.ts')).saveSettings({ helper_name: 'অমল', helper_phone: '90000 11111' }))
  await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
  await step('home: each book is one plain line, no bars', page, async () => {
    if (await page.locator('.bookcard .barrow').count()) throw new Error('progress bars are still on the home screen')
    const work = await page.locator('.bookcard', { hasText: 'কাজ' }).first().innerText()
    if (!work.includes('১ কাজ চলছে') || !work.includes('রায়বাড়ি')) throw new Error('the কাজ line reads: ' + work.replace(/\n+/g, ' | '))
  })
  await step('home: the sync line has moved to Settings', page, async () => {
    if (await page.getByText('শুধু ফোনে রাখা হচ্ছে').count()) throw new Error('the sync line is still on home')
    await page.getByLabel('সেটিংস').click()
    await page.getByText('শুধু ফোনে রাখা হচ্ছে').first().waitFor({ timeout: 3000 })
    await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
  })
  await step('home: সাহায্য offers a call to the helper', page, async () => {
    await tap(page, 'সাহায্য', true)
    await page.getByText('অমল কে ফোন করুন').first().waitFor({ timeout: 3000 })
    const tel = await page.locator('.sheet a[href^="tel:"]').first().getAttribute('href')
    if (tel !== 'tel:+919000011111') throw new Error('call link: ' + tel)
  })
  await step('home: every stop of the walk round still has its place', page, async () => {
    await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
    for (const tgt of ['today', 'brief', 'books', 'standing', 'all']) if (!(await page.locator(`[data-tour="${tgt}"]`).count())) throw new Error('no tour target ' + tgt)
  })
  await ctx.close()
}

/* ---- D8: a crash never leaves a blank screen ---- */
{
  const { ctx, page } = await fresh()
  await page.evaluate(async () => (await import('/src/lib/store.ts')).saveSettings({ helper_name: 'অমল', helper_phone: '90000 11111' }))
  await step('crash: a calm screen, a way back, and whom to ring', page, async () => {
    // A change after # alone does not reload the page; reload so the app starts with it.
    await page.goto(ORIGIN + '#crash-test'); await page.reload()
    await page.getByText('কিছু একটা গোলমাল হয়েছে। আপনার লেখা হিসাব হারায়নি।').waitFor({ timeout: 6000 })
    await page.getByText('আবার খুলুন').first().waitFor({ timeout: 2000 })
    const tel = await page.locator('a[href^="tel:"]').first().getAttribute('href')
    if (tel !== 'tel:+919000011111') throw new Error('call link: ' + tel)
  })
  await ctx.close()
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
    await page.getByText('খাতায় তুলুন').click()
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
    await page.getByText('আর কিছু?').waitFor({ timeout: 3000 })
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
    await page.getByText('আর কিছু?').waitFor({ timeout: 4000 })
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

/* ---- B7: ring, or send a reminder, from every পাবেন row ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await step('পাবেন: a customer with a number can be rung or sent a তাগাদা on WhatsApp', page, async () => {
    await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const db = await import('/src/lib/db.ts')
      const now = new Date().toISOString()
      await m.saveMaster({ id: 'c2', kind: 'party', name_bn: 'রহিম', ptype: 'client', terms_days: 0, phone: '98300 12345', updated_at: now })
      await m.saveSettings({ owner_bn: 'সুবীর' })
      const row = (id, party, amount) => ({ id, kind: 'stock', batch: db.uid(), date: '2026-09-01', project_id: '', created_at: now, item_id: '', dir: 'opening_get', qty: 0, rate: 0, amount, party_id: party, due_date: '2026-09-15', paid: false, photo_id: '' })
      await m.saveEntries([row('o1', 'c2', 12500), row('o2', 'c1', 800)])
    })
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    await tap(page, 'টাকা দেওয়া-নেওয়া')
    const tel = await page.locator('a[href^="tel:"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    if (!tel.includes('tel:+919830012345')) throw new Error('no call link: ' + tel.join(' '))
    const wa = await page.locator('a[href^="https://wa.me/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    const want = 'https://wa.me/919830012345?text=' + encodeURIComponent('নমস্কার রহিম, ১ সেপ্টেম্বর থেকে ₹১২,৫০০ বাকি আছে। সুবিধামতো দিয়ে দেবেন। — সুবীর')
    if (!wa.includes(want)) throw new Error('reminder link: ' + wa.join(' '))
    await page.getByText('তাগাদা পাঠান').first().waitFor({ timeout: 2000 })
  })
  await step('পাবেন: a customer with no number is offered the phone book instead', page, async () => {
    await page.getByText('নম্বর নেই — ফোনবুক থেকে নিন').first().waitFor({ timeout: 2000 })
    const wa = await page.locator('a[href^="https://wa.me/"]').count()
    if (wa !== 1) throw new Error(wa + ' WhatsApp links; only the customer with a number should have one')
  })
  await ctx.close()
}

/* ---- B8: the phone's own brief names the three who owe him most ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await step("brief: the to-dos start with the three largest amounts owed to him", page, async () => {
    const todo = await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const db = await import('/src/lib/db.ts'); const b = await import('/src/lib/brief.ts')
      const now = new Date().toISOString()
      for (const [id, name] of [['q1', 'এক'], ['q2', 'দুই'], ['q3', 'তিন'], ['q4', 'চার']]) {
        await m.saveMaster({ id, kind: 'party', name_bn: name, ptype: 'client', terms_days: 0, phone: '', updated_at: now })
      }
      const row = (party, amount) => ({ id: db.uid(), kind: 'stock', batch: db.uid(), date: '2026-09-01', project_id: '', created_at: now, item_id: '', dir: 'opening_get', qty: 0, rate: 0, amount, party_id: party, due_date: '2026-12-01', paid: false, photo_id: '' })
      await m.saveEntries([row('q1', 1000), row('q2', 4000), row('q3', 2500), row('q4', 3000)])
      return b.localBrief().todo_bn
    })
    const want = ['দুই — ₹৪,০০০ পাওনা', 'চার — ₹৩,০০০ পাওনা', 'তিন — ₹২,৫০০ পাওনা']
    if (JSON.stringify(todo.slice(0, 3)) !== JSON.stringify(want)) throw new Error('to-dos: ' + JSON.stringify(todo))
  })
  await ctx.close()
}

/* ---- his name and number, and the helper's, can be set and changed ---- */
{
  const { ctx, page } = await fresh()
  await step('settings: names and phone numbers are kept on a page of their own', page, async () => {
    await page.getByLabel('সেটিংস').click()
    await tap(page, 'নাম ও ফোন')
    const box = (label) => page.locator('.field', { hasText: label }).locator('input')
    await box('আপনার নাম').fill('সুবীর রায়')
    await box('আপনার ফোন').fill('98300 12345')
    await box('যিনি পাশে থেকে সাহায্য করবেন').fill('অমল')
    await box('তাঁর ফোন').fill('90000 11111')
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(300)
    const st = await page.evaluate(async () => { const s = (await import('/src/lib/store.ts')).getState().settings; return [s.owner_bn, s.owner_phone, s.helper_name, s.helper_phone].join('|') })
    if (st !== 'সুবীর রায়|98300 12345|অমল|90000 11111') throw new Error('saved: ' + st)
  })
  await ctx.close()
}

/* ---- C1: a new job asks its contract, the stage it is at, and what came in so far ---- */
{
  const { ctx, page } = await fresh()
  await step('new job: contract, stage now and received so far are all written', page, async () => {
    await page.evaluate(async () => { await (await import('/src/lib/seed.ts')).seedHouse([]) })
    await page.locator('.bookcard', { hasText: 'কাজ' }).first().click()
    await tap(page, 'কাজ যোগ করা, বদলানো')
    await page.getByLabel('নতুন').click()
    await page.locator('.sheet .field', { hasText: 'কাজের নাম' }).locator('input').fill('নতুন সাইট')
    await pad(page, ['১', '০', '০', '০', '০', '০', '০'])
    await tap(page, 'প্লিন্থ ঢালাই', true)
    await page.locator('.sheet .field', { hasText: 'এ পর্যন্ত কত পেয়েছেন?' }).locator('input').fill('200000')
    await page.locator('.sheet .btn.primary').last().click()
    await page.waitForTimeout(500)
    const r = await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts')
      const s = m.getState(); const p = s.masters.find((x) => x.kind === 'project' && x.name_bn === 'নতুন সাইট')
      if (!p) return null
      const tt = c.projectTotals(p, s.entries, m.stages(s))
      return { budget: p.budget, received: tt.received, pct: Math.round(tt.pct_done), cash: c.cashState(s.entries, s.settings.opening_cash, s.settings.opening_date).computed }
    })
    if (!r || r.budget !== 1000000 || r.received !== 200000 || r.pct !== 23 || r.cash !== 10000) throw new Error(JSON.stringify(r))
  })
  await ctx.close()
}

/* ---- C2: the job card says it plainly ---- */
{
  const { ctx, page } = await fresh()
  await step('job card: agreed, received, spent, left in hand, and the stage it is at', page, async () => {
    const hasCurve = await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const seed = await import('/src/lib/seed.ts'); const js = await import('/src/lib/jobstart.ts'); const db = await import('/src/lib/db.ts')
      await seed.seedHouse([])
      const p = m.getState().masters.find((x) => x.id === 'p1')
      await m.saveMaster({ ...p, ptype: seed.HOUSE, plan_days: 180, area_sqft: 1000 })
      await m.saveEntries(js.jobStartRows('p1', seed.HOUSE_STAGES, 3, 200000))
      await m.saveEntries([{ id: db.uid(), kind: 'money', batch: db.uid(), date: (await import('/src/lib/bn.ts')).isoDate(), project_id: 'p1', created_at: new Date().toISOString(), head_bn: 'ঠিকা কাজ', dir: 'paid', amount: 50000, party_id: '', mode: 'নগদ', note: '', personal: false, photo_id: '' }])
      return !!(await import('/src/lib/brief.ts')).localBrief().series?.scurve
    })
    await page.locator('.bookcard', { hasText: 'কাজ' }).first().click()
    await page.getByText('হাতে থাকল').first().waitFor({ timeout: 3000 })
    const card = await page.locator('.jobcard').first().innerText()
    for (const w of ['চুক্তি', '১০,০০,০০০', 'পেয়েছেন', '২,০০,০০০', 'খরচ', '৫০,০০০', 'হাতে থাকল', '১,৫০,০০০', 'প্লিন্থ ঢালাই']) {
      if (!card.includes(w)) throw new Error('the card does not say ' + w + ': ' + card.replace(/\n+/g, ' | '))
    }
    if (await page.getByText('খরচ আর পরিকল্পনা').count()) throw new Error('the S-curve shows before আরও দেখুন')
    await tap(page, 'আরও দেখুন')
    if (hasCurve && !(await page.getByText('খরচ আর পরিকল্পনা').count())) throw new Error('আরও দেখুন did not show the S-curve')
  })
  await ctx.close()
}

/* ---- C3: no man without a daily wage, in setup too ---- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(ORIGIN)
  await step('setup: a man named without a wage cannot be passed', page, async () => {
    await page.getByText('খাতাটা এবার ফোনে').waitFor({ timeout: 8000 })
    await tap(page, 'শুরু করি')
    await page.getByText('কোন ভাষায় দেখতে চান?').waitFor({ timeout: 4000 })
    await page.locator('.pick').first().click(); await tap(page, 'এগিয়ে যান')
    await page.getByText('আপনার নাম?').waitFor({ timeout: 4000 })
    await page.locator('input.input').first().fill('বিমল'); await tap(page, 'এগিয়ে যান')
    await page.getByText('এখন কোন কাজটা চলছে?').waitFor({ timeout: 4000 })
    await page.locator('input.input').first().fill('রামপুর বাড়ি'); await tap(page, 'এগিয়ে যান')
    await page.getByText('কারা কাজ করে?').waitFor({ timeout: 4000 })
    await page.locator('input.input').nth(0).fill('রতন')
    if (await page.locator('.actionbar .btn.primary').isEnabled()) throw new Error('a man with no wage could be passed')
    await page.locator('input.input').nth(1).fill('600')
    if (!(await page.locator('.actionbar .btn.primary').isEnabled())) throw new Error('a man with a wage could not be passed')
  })
  await ctx.close()
}

/* ---- every person can be reached: the tenth customer is picked, never typed again ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await page.evaluate(async () => {
    const m = await import('/src/lib/store.ts')
    const now = new Date().toISOString()
    for (let k = 1; k <= 10; k++) await m.saveMaster({ id: 'cc' + k, kind: 'party', name_bn: 'খদ্দের নম্বর ' + k, ptype: 'client', terms_days: 0, phone: '', updated_at: now })
  })
  const pickTenth = async () => {
    await tap(page, 'আরও…', true)
    await page.locator('.sheet input').first().fill('10')
    await page.locator('.sheet .pick', { hasText: 'খদ্দের নম্বর 10' }).first().click()
  }
  const partyOf = (dir) => page.evaluate(async (dir) => (await import('/src/lib/store.ts')).getState().entries.filter((e) => e.kind === 'stock' && e.dir === dir).pop()?.party_id, dir)
  await step('people: "বাকিতে দিলাম" can reach the tenth customer', page, async () => {
    await page.locator('.bookcard', { hasText: 'মজুত' }).first().click()
    await tap(page, 'শুধু টাকার হিসাব — বাকিতে দিলাম')
    await pickTenth()
    await pad(page, ['৫', '০', '০'])
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    if ((await partyOf('sale')) !== 'cc10') throw new Error('sold to ' + (await partyOf('sale')))
  })
  await step('people: a sale of goods can reach the tenth customer', page, async () => {
    await toWho(page, 'মাল ধরে বিক্রি', ['১'], ['১', '০', '০'])
    await pickTenth()
    await tap(page, 'হ্যাঁ', true)
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    if ((await partyOf('sale')) !== 'cc10') throw new Error('sold to ' + (await partyOf('sale')))
  })
  await step('people: an old balance can reach the tenth customer', page, async () => {
    await page.goto(ORIGIN); await page.locator('.headline').waitFor({ timeout: 5000 })
    await page.locator('.bookcard', { hasText: 'হিসাব' }).first().click()
    await tap(page, 'পুরোনো বাকি', true)
    await tap(page, 'উনি আমাকে দেবেন')
    await pickTenth()
    await pad(page, ['৯', '০', '০'])
    await page.locator('.sheet .btn.primary').last().click()
    await page.waitForTimeout(400)
    if ((await partyOf('opening_get')) !== 'cc10') throw new Error('owed by ' + (await partyOf('opening_get')))
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
  await page.getByText('আর কিছু?').waitFor({ timeout: 3000 }); await page.locator('.actionbar .btn.primary').click()
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
