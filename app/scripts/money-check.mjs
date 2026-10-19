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
  await page.locator('.app[data-screen="setup"]').waitFor({ timeout: 8000 })
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
  await page.locator('[data-tour="today"]').waitFor({ timeout: 6000 })
  return { ctx, page }
}

const tap = (page, text, exact = false) => page.getByText(text, { exact }).first().click()
const tabBtn = (page, name) => page.locator('.tabbar button', { hasText: name })
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
const no = (page) => page.locator('.yesno button', { hasText: /^না$/ }).first().click()
const yes = (page) => page.locator('.yesno button', { hasText: /^হ্যাঁ$/ }).first().click()
const next = (page) => page.locator('.actionbar .btn.primary').last().click()
/** The evening on a phone with one job and no men, up to "money for this job?". */
const toReceived = async (page) => {
  await page.locator('[data-tour="today"]').click()
  await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').waitFor({ timeout: 4000 }); await next(page)
  await page.getByText('মাল এল?').waitFor({ timeout: 4000 }); await no(page)
  await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
  await page.getByText('এই কাজের টাকা পেলেন?').waitFor({ timeout: 3000 })
}
/** From after the money question to the review, agreeing with whatever the book expects in hand. */
const finishDay = async (page) => {
  await page.getByText('কাজ কতটা হয়েছে?').waitFor({ timeout: 3000 }); await next(page)
  await page.getByText('নিজের বা সংসারের কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
  await page.getByText('এখন হাতে কত টাকা?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
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

/* ---- the evening, job by job: two jobs, a man at both, the slider, and back to review ---- */
const twoJobs = async (page) => page.evaluate(async () => {
  const m = await import('/src/lib/store.ts'); const seed = await import('/src/lib/seed.ts')
  await seed.seedKinds([])
  const p = m.getState().masters.find((x) => x.id === 'p1')
  await m.saveMaster({ ...p, ptype: seed.HOUSE })
  const now = new Date().toISOString()
  await m.saveMaster({ id: 'p2', kind: 'project', name_bn: 'বসু বাড়ির রং', client_bn: '', ptype: 'রং', area_sqft: null, budget: 85000, start_date: '2026-10-01', plan_days: null, status: 'active', updated_at: now })
  await m.saveMaster({ id: 'w1', kind: 'worker', name_bn: 'রতন', rate: 600, phone: '', active: true, updated_at: now })
  await m.saveMaster({ id: 'w2', kind: 'worker', name_bn: 'সুকুমার', rate: 650, phone: '', active: true, updated_at: now })
})
/* One job's questions after who-came, all answered "no", the slider left alone. */
const quietJob = async (page) => {
  await page.getByText('মাল এল?').waitFor({ timeout: 3000 }); await no(page)
  await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
  await page.getByText('এই কাজের টাকা পেলেন?').waitFor({ timeout: 3000 }); await no(page)
  await page.getByText('কাজ কতটা হয়েছে?').waitFor({ timeout: 3000 }); await next(page)
}
{
  const { ctx, page } = await fresh({ shop: true })
  await twoJobs(page)
  await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
  await step('evening: the first question is which jobs, and nothing ticked says so', page, async () => {
    await page.locator('[data-tour="today"]').click()
    await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').waitFor({ timeout: 4000 })
    if (!(await page.getByText('আজ কোনো কাজের হিসাব নেই').count())) throw new Error('with nothing ticked the button should say so')
    if (!(await page.locator('.pick', { hasText: 'দোকানের লোক' }).count())) throw new Error('no দোকানের লোক row though he has a shop and men')
  })
  await step('evening: two jobs are asked in the order ticked, each with its tag', page, async () => {
    await page.locator('.pick', { hasText: 'বসু বাড়ির রং' }).click()
    await page.locator('.pick', { hasText: 'রায়বাড়ি' }).click()
    await next(page)
    await page.getByText('আজ কে কে এসেছিল?').waitFor({ timeout: 3000 })
    const sec = await page.locator('.wizhead .sec').innerText()
    if (!sec.includes('বসু বাড়ির রং') || !sec.includes('১/২')) throw new Error('the tag reads ' + sec)
  })
  await step('evening: a man written at the first job shows as written at the second, unticked', page, async () => {
    await page.locator('.pick', { hasText: 'সুকুমার' }).click()
    await next(page)
    await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 }); await next(page)
    await quietJob(page)
    await page.getByText('আজ কে কে এসেছিল?').waitFor({ timeout: 3000 })
    const sec = await page.locator('.wizhead .sec').innerText()
    if (!sec.includes('রায়বাড়ি') || !sec.includes('২/২')) throw new Error('the second tag reads ' + sec)
    const row = await page.locator('.pick', { hasText: 'সুকুমার' }).innerText()
    if (!row.includes('আজ লেখা হয়েছে') || !row.includes('বসু বাড়ির রং')) throw new Error('his row reads ' + row)
    if (await page.locator('.pick.on', { hasText: 'সুকুমার' }).count()) throw new Error('he is ticked at the second job')
  })
  await step('evening: half a day is a visible button, not a long press', page, async () => {
    await page.locator('.pick', { hasText: 'রতন' }).click()
    await page.locator('.pick', { hasText: 'রতন' }).locator('.chg').click()
    await page.getByText('আধা দিন', { exact: true }).click()
    const row = await page.locator('.pick', { hasText: 'রতন' }).innerText()
    if (!row.includes('আধা দিন') || !row.includes('৩০০')) throw new Error('his row reads ' + row)
    await next(page)
    await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 }); await next(page)
    await quietJob(page)
  })
  await step('evening: after the jobs, the shop, his own spending and the cash come once', page, async () => {
    await page.getByText('দোকানের জন্য মাল কিনলেন?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('নিজের বা সংসারের কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('এখন হাতে কত টাকা?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
    await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
    const review = await page.locator('.scroll').first().innerText()
    if (review.indexOf('বসু বাড়ির রং') < 0 || review.indexOf('রায়বাড়ি') < review.indexOf('বসু বাড়ির রং')) throw new Error('the review is not grouped job by job in order')
  })
  await step('evening: a jump from review comes back to review', page, async () => {
    await page.locator('.review-row', { hasText: 'মজুরি' }).last().click()
    await page.getByText('আজ কে কে এসেছিল?').waitFor({ timeout: 3000 }); await next(page)
    await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 }); await next(page)
    await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
  })
  await step('evening: both jobs are saved in one go, each with its own men', page, async () => {
    await page.getByText('খাতায় তুলুন').click()
    await page.getByText('আজকের হিসাব লেখা হল').waitFor({ timeout: 5000 })
    const rows = await page.evaluate(async () => (await import('/src/lib/store.ts')).getState().entries.filter((e) => e.kind === 'attendance').map((e) => e.worker_id + ':' + e.project_id + ':' + e.amount).sort().join())
    if (rows !== 'w1:p1:300,w2:p2:650') throw new Error('wage rows: ' + rows)
    const batches = await page.evaluate(async () => new Set((await import('/src/lib/store.ts')).getState().entries.map((e) => e.batch)).size)
    if (batches !== 1) throw new Error('the evening was written in ' + batches + ' batches')
  })
  await ctx.close()
}
/* ---- the slider starts where he left it, and writes only when moved ---- */
{
  const { ctx, page } = await fresh()
  await page.evaluate(async () => {
    const m = await import('/src/lib/store.ts'); const seed = await import('/src/lib/seed.ts'); const bn = await import('/src/lib/bn.ts'); const db = await import('/src/lib/db.ts')
    await seed.seedKinds([])
    const p = m.getState().masters.find((x) => x.id === 'p1')
    await m.saveMaster({ ...p, ptype: seed.HOUSE })
    const y = bn.addDays(bn.isoDate(), -1)
    await m.saveEntries([{ id: db.uid(), kind: 'progress', batch: db.uid(), date: y, project_id: 'p1', created_at: y + 'T15:00:00.000Z', stage_seq: 0, state: 'pct', pct: 55 }])
  })
  await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
  const pctRows = () => page.evaluate(async () => (await import('/src/lib/store.ts')).getState().entries.filter((e) => e.kind === 'progress' && e.state === 'pct').map((e) => e.pct).join())
  await step('slider: it opens at yesterday’s 55% with the step that falls in', page, async () => {
    await toReceived(page); await no(page)
    await page.getByText('কাজ কতটা হয়েছে?').waitFor({ timeout: 3000 })
    const big = await page.locator('.pctbig').innerText()
    if (!big.includes('৫৫%')) throw new Error('it opens at ' + big)
    const body = await page.locator('.scroll').first().innerText()
    if (!body.includes('গতকাল ছিল ৫৫%')) throw new Error('no "yesterday it was 55%" line: ' + body.slice(0, 200))
    if (!body.includes('এখন চলছে: ছাদ ঢালাই')) throw new Error('the step under it is not ছাদ ঢালাই')
  })
  await step('slider: + moves it by five', page, async () => {
    await page.locator('.pm button', { hasText: '+' }).click()
    const big = await page.locator('.pctbig').innerText()
    if (!big.includes('৬০%')) throw new Error('after + it reads ' + big)
    await next(page)
    await page.getByText('নিজের বা সংসারের কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('এখন হাতে কত টাকা?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
    await page.getByText('খাতায় তুলুন').click()
    await page.getByText('আজকের হিসাব লেখা হল').waitFor({ timeout: 5000 })
    if ((await pctRows()) !== '55,60') throw new Error('slider rows: ' + (await pctRows()))
  })
  await step('slider: left alone the next evening, it writes nothing new', page, async () => {
    await page.locator('[data-tour="today"]').click()
    await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').waitFor({ timeout: 4000 }); await next(page)
    await page.getByText('মাল এল?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('এই কাজের টাকা পেলেন?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('কাজ কতটা হয়েছে?').waitFor({ timeout: 3000 })
    if (!(await page.locator('.pctbig').innerText()).includes('৬০%')) throw new Error('it does not open at 60')
    await next(page)
    await page.getByText('নিজের বা সংসারের কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('এখন হাতে কত টাকা?').waitFor({ timeout: 3000 }); await tap(page, 'হ্যাঁ, এটাই আছে')
    await page.getByText('খাতায় তুলুন').click()
    await page.getByText('আজকের হিসাব লেখা হল').waitFor({ timeout: 5000 })
    if ((await pctRows()) !== '55,60') throw new Error('an untouched slider wrote: ' + (await pctRows()))
  })
  await ctx.close()
}
{
  const { ctx, page } = await fresh()
  await step('evening: a day half-written by the old build opens with nothing lost', page, async () => {
    await page.evaluate(async () => {
      const d = await import('/src/lib/draft.ts'); const bn = await import('/src/lib/bn.ts')
      const old = { batch: 'bold', date: bn.isoDate(), project_id: 'p1', att: {}, mats: [], rets: [], pexps: [], invs: [], recv: [], progress: null,
        cash_counted: null, cash_computed: null, note: '', step: 3, at: 'material', started_at: new Date().toISOString(), from_yesterday: false,
        exps: [{ key: 'x', head_bn: 'চা-জলখাবার', amount: 120, mode: 'নগদ', note: '', photo_id: '' }] }
      await d.saveDraft(old)
    })
    await page.locator('[data-tour="today"]').click()
    await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').waitFor({ timeout: 4000 })
    if (!(await page.locator('.pick.on', { hasText: 'রায়বাড়ি' }).count())) throw new Error('the old day’s job is not ticked')
    await next(page)
    await page.getByText('মাল এল?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 })
    const body = await page.locator('.scroll').first().innerText()
    if (!body.includes('চা-জলখাবার') || !body.includes('১২০')) throw new Error('the expense typed before is gone')
  })
  await ctx.close()
}

/* ---- D4: nothing he typed is lost by accident ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await step('sheet: an empty sheet closes on a tap outside it', page, async () => {
    await tabBtn(page, 'টাকা').click()
    await tap(page, 'কাগজের খাতার পুরোনো বাকি', true)
    await page.locator('.sheet').waitFor({ timeout: 3000 })
    await page.mouse.click(12, 12)
    await page.waitForTimeout(300)
    if (await page.locator('.sheet').count()) throw new Error('the empty sheet stayed open')
  })
  await step('sheet: a sheet with a name typed in stays open on a stray tap', page, async () => {
    await tap(page, 'কাগজের খাতার পুরোনো বাকি', true)
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
    await page.locator('[data-tour="today"]').click()
    await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').waitFor({ timeout: 4000 }); await next(page)
    await page.getByText('মাল এল?').waitFor({ timeout: 4000 }); await no(page)
    await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 }); await yes(page)
    await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
    await page.locator('.chips button').first().click()
    await pad(page, ['১', '২', '০'])
    await tap(page, 'যোগ করুন', true)
    await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 })
    if (await page.locator('.yesno button', { hasText: /^না$/ }).count()) throw new Error('না is still offered beside a written expense')
  })
  await ctx.close()
}

/* ---- four tabs along the bottom, and a quiet home with who owes him ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  await page.evaluate(async () => {
    const m = await import('/src/lib/store.ts'); const db = await import('/src/lib/db.ts')
    const now = new Date().toISOString()
    await m.saveMaster({ id: 'c2', kind: 'party', name_bn: 'দত্তবাবু', ptype: 'client', terms_days: 0, phone: '98300 12345', updated_at: now })
    await m.saveMaster({ id: 'c3', kind: 'party', name_bn: 'পাল মশাই', ptype: 'client', terms_days: 0, phone: '', updated_at: now })
    await m.saveMaster({ id: 'c4', kind: 'party', name_bn: 'বসু', ptype: 'client', terms_days: 0, phone: '', updated_at: now })
    const row = (id, party, amount) => ({ id, kind: 'stock', batch: db.uid(), date: '2026-09-20', project_id: '', created_at: now, item_id: '', dir: 'opening_get', qty: 0, rate: 0, amount, party_id: party, due_date: '', paid: false, photo_id: '' })
    await m.saveEntries([row('o1', 'c1', 500), row('o2', 'c2', 12000), row('o3', 'c3', 3500), row('o4', 'c4', 800)])
    await m.saveSettings({ helper_name: 'অমল', helper_phone: '90000 11111' })
  })
  await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
  const tabNames = async () => (await page.locator('.tabbar button').allInnerTexts()).map((x) => x.trim()).join(' ')
  await step('tabs: four along the bottom', page, async () => {
    const names = await tabNames()
    if (names !== 'আজ কাজ দোকান টাকা') throw new Error('the tabs read: ' + names)
    if (!(await page.locator('.tabbar button.on', { hasText: 'আজ' }).count())) throw new Error('আজ is not the tab shown first')
  })
  await step('tabs: Back from কাজ lands on আজ', page, async () => {
    await tabBtn(page, 'কাজ').click()
    await page.locator('.tabbar button.on', { hasText: 'কাজ' }).waitFor({ timeout: 3000 })
    await page.evaluate(() => window.__shellBack())
    await page.locator('.tabbar button.on', { hasText: 'আজ' }).waitFor({ timeout: 3000 })
  })
  await step('home: the three largest who owe him, each with a call where there is a number', page, async () => {
    const rows = await page.locator('[data-tour="owed"] .owedrow').allInnerTexts()
    const names = rows.map((r) => r.split('\n')[0].trim()).join(',')
    if (names !== 'দত্তবাবু,পাল মশাই,বসু') throw new Error('the owed list reads: ' + names)
    const tel = await page.locator('[data-tour="owed"] a[href^="tel:"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    if (tel.join() !== 'tel:+919830012345') throw new Error('call links: ' + tel.join(' '))
  })
  await step('home: সবাইকে দেখুন opens the টাকা tab', page, async () => {
    await tap(page, 'সবাইকে দেখুন')
    await page.locator('.tabbar button.on', { hasText: 'টাকা' }).waitFor({ timeout: 3000 })
    await tabBtn(page, 'আজ').click()
  })
  await step('home: the help line calls the helper', page, async () => {
    const help = page.locator('a[href="tel:+919000011111"]')
    if (!(await help.count())) throw new Error('no call link to the helper')
    if (!(await help.first().innerText()).includes('অমল')) throw new Error('the help line does not name the helper')
  })
  await step('home: the old blocks are gone', page, async () => {
    for (const sel of ['.bookcard', '.footbar']) if (await page.locator(sel).count()) throw new Error(sel + ' is still on home')
    for (const w of ['সব কিছু', 'নজর দেওয়ার মতো', 'কালকের মতোই']) if (await page.getByText(w, { exact: true }).count()) throw new Error(w + ' is still on home')
  })
  await step('home: the first-count card goes away for a week on পরে', page, async () => {
    await page.getByText('দোকানের মাল একবার গুনে লিখুন').waitFor({ timeout: 3000 })
    await tap(page, 'পরে', true)
    await page.waitForTimeout(300)
    if (await page.getByText('দোকানের মাল একবার গুনে লিখুন').count()) throw new Error('the card is still there')
    await page.reload(); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    if (await page.getByText('দোকানের মাল একবার গুনে লিখুন').count()) throw new Error('the card came back after a reload')
    const until = await page.evaluate(async () => { const m = await import('/src/lib/store.ts'); const bn = await import('/src/lib/bn.ts'); return m.getState().settings.count_later_until === bn.addDays(bn.isoDate(), 7) })
    if (!until) throw new Error('it should come back in a week')
  })
  await step('tabs: with no shop there are three', page, async () => {
    await page.evaluate(async () => (await import('/src/lib/store.ts')).saveSettings({ runs_shop: false }))
    await page.reload(); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    const names = await tabNames()
    if (names !== 'আজ কাজ টাকা') throw new Error('the tabs read: ' + names)
  })
  await ctx.close()
}

/* ---- G: the phone's brief after the evening is saved, and no name reaches Google ---- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message))
  const asked = []
  await page.route('https://generativelanguage.googleapis.com/**', (route) => {
    const req = route.request()
    if (req.method() === 'POST') asked.push(req.postData() || '')
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ candidates: [] }) })
  })
  // 7:10 in the evening in Kolkata.
  await page.clock.setFixedTime(new Date('2026-10-16T13:40:00Z'))
  await page.goto(ORIGIN)
  await page.locator('.app[data-screen="setup"]').waitFor({ timeout: 8000 })
  await page.evaluate(async () => {
    const m = await import('/src/lib/store.ts'); const bn = await import('/src/lib/bn.ts'); const db = await import('/src/lib/db.ts')
    const now = new Date().toISOString()
    await m.saveMaster({ id: 'p1', kind: 'project', name_bn: 'রায়বাড়ি', client_bn: 'সুবীর রায়', ptype: 'বাড়ি', area_sqft: null, budget: 1000000, start_date: bn.isoDate(), plan_days: null, status: 'active', updated_at: now })
    await m.saveMaster({ id: 'w1', kind: 'worker', name_bn: 'রতন মিস্ত্রি', rate: 600, phone: '', active: true, updated_at: now })
    await m.saveMaster({ id: 's1', kind: 'party', name_bn: 'শর্মা ট্রেডার্স', ptype: 'supplier', terms_days: 15, phone: '', updated_at: now })
    await m.saveMaster({ id: 'c9', kind: 'party', name_bn: 'পুরোনো খদ্দের দাস', ptype: 'client', terms_days: 0, phone: '', updated_at: now })
    await m.saveEntries([
      { id: db.uid(), kind: 'stock', batch: db.uid(), date: bn.addDays(bn.isoDate(), -3), project_id: 'p1', created_at: now, item_id: '', dir: 'in', qty: 0, rate: 0, amount: 4000, party_id: 's1', due_date: bn.isoDate(), paid: false, photo_id: '' },
      { id: db.uid(), kind: 'stock', batch: db.uid(), date: bn.addDays(bn.isoDate(), -40), project_id: '', created_at: now, item_id: '', dir: 'opening_get', qty: 0, rate: 0, amount: 7000, party_id: 'c9', due_date: bn.isoDate(), paid: false, photo_id: '' },
    ])
    await m.saveSettings({ onboarded: true, toured: true, runs_shop: false, opening_cash: 10000, opening_date: bn.addDays(bn.isoDate(), -5),
      owner_bn: 'বিমল ঘোষ', helper_name: 'অমল বসু', ai_key: 'AIza' + 'TESTKEY0123456789abcdefghijklmnop' })
  })
  await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 6000 })
  await step('brief: after 6 pm nothing is sent until the evening is saved', page, async () => {
    // Building a brief takes a few seconds (the figures are worked out first); wait long enough to see one.
    await page.waitForTimeout(5000)
    if (asked.length) throw new Error(asked.length + ' brief request(s) sent before the day was saved')
  })
  await step('brief: saving the evening sends it', page, async () => {
    await page.locator('[data-tour="today"]').click()
    await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').waitFor({ timeout: 4000 }); await next(page)
    await page.getByText('আজ কে কে এসেছিল?').waitFor({ timeout: 4000 })
    await page.locator('.pick', { hasText: 'রতন মিস্ত্রি' }).click(); await next(page)
    await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 }); await next(page)
    await page.getByText('মাল এল?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
    await page.getByText('এই কাজের টাকা পেলেন?').waitFor({ timeout: 3000 }); await no(page)
    await finishDay(page)
    await page.getByText('খাতায় তুলুন').click()
    for (let k = 0; k < 40 && !asked.length; k++) await page.waitForTimeout(250)
    if (!asked.length) throw new Error('no brief request after the evening was saved')
  })
  await step('brief: no name goes to Google', page, async () => {
    const sent = asked.join('\n')
    const leaked = ['রায়বাড়ি', 'সুবীর রায়', 'রতন মিস্ত্রি', 'শর্মা ট্রেডার্স', 'পুরোনো খদ্দের দাস', 'বিমল ঘোষ', 'অমল বসু'].filter((n) => sent.includes(n))
    if (leaked.length) throw new Error('sent to Google: ' + leaked.join(', '))
  })
  await ctx.close()
}

/* ---- S1: the whole shop counted in one sitting ---- */
{
  const { ctx, page } = await fresh({ shop: true })
  const openCount = async () => {
    await tabBtn(page, 'দোকান').click()
    await tap(page, 'পুরো দোকান গোনা')
    await page.locator('input.input').first().waitFor({ timeout: 3000 })
  }
  const addRow = async (search, name, qty, rate) => {
    await page.locator('input.input').first().fill(search)
    await page.locator('.pick', { hasText: name }).first().click()
    await pad(page, qty)
    if (rate) await page.locator('.sheet .field', { hasText: 'কেনা দর' }).locator('input').fill(rate)
    await page.locator('.sheet .btn.primary').click()
    await page.waitForTimeout(200)
  }
  await step('count: rows typed so far survive leaving the screen', page, async () => {
    await openCount()
    await addRow('পাইপ', 'পাইপ', ['৫', '০'], '400')
    await addRow('পিভিসি পাইপ ১"', 'পিভিসি পাইপ ১"', ['২', '০'], '')
    await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    await openCount()
    const txt = await page.locator('.scroll').first().innerText()
    if (!txt.includes('পিভিসি পাইপ ১"') || !txt.includes('৫০')) throw new Error('the draft came back as: ' + txt.replace(/\n+/g, ' | ').slice(0, 200))
  })
  await step('count: saving sets the shelf, once, even on a double tap', page, async () => {
    await page.locator('.actionbar .btn.primary').dblclick()
    await page.waitForTimeout(600)
    const r = await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts')
      const s = m.getState()
      const lv = c.shopStock(s.entries, m.items(s))
      const pvc = m.items(s).find((i) => i.name_bn === 'পিভিসি পাইপ ১"')
      return {
        counts: s.entries.filter((e) => e.kind === 'stock' && e.dir === 'count').length,
        pipe: lv.find((l) => l.item_id === 'i1'),
        pvc: pvc ? lv.find((l) => l.item_id === pvc.id) : null,
      }
    })
    if (r.counts !== 2) throw new Error(r.counts + ' count rows, not 2')
    if (!r.pipe || r.pipe.qty !== 50 || r.pipe.value !== 20000) throw new Error('pipe: ' + JSON.stringify(r.pipe))
    if (!r.pvc || r.pvc.qty !== 20) throw new Error('catalogue pipe: ' + JSON.stringify(r.pvc))
  })
  await step('count: once the shop is counted, home stops asking for it', page, async () => {
    const at = await page.evaluate(async () => (await import('/src/lib/store.ts')).getState().settings.full_count_at)
    if (!at) throw new Error('the full count was not marked done')
    await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    if (await page.getByText('দোকানের মাল একবার গুনে লিখুন').count()) throw new Error('home still asks for the first count')
  })
  await ctx.close()
}

/* ---- D9: the first evening reads right ---- */
{
  const { ctx, page } = await fresh()
  await step("home: last night's brief stands until a day is saved after it", page, async () => {
    await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const b = await import('/src/lib/brief.ts')
      const lastNight = new Date(Date.now() - 6 * 3600000).toISOString()
      m.setState({ brief: b.parseBrief({ generated_at: lastNight, headline_bn: 'খাতাটা নতুন', cards: [], projects: [], alerts: [], todo_bn: [] }) })
    })
    await page.waitForTimeout(300)
    const before = await page.locator('.headline').innerText()
    if (before !== 'খাতাটা নতুন') throw new Error('the brief was not shown to begin with: ' + before)
    await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const d = await import('/src/lib/draft.ts')
      await m.saveEntries(d.buildEntries({ ...d.newDraft(), project_id: 'p1', cash_counted: 10000, cash_computed: 10000 }))
    })
    await page.waitForTimeout(300)
    const after = await page.locator('.headline').innerText()
    if (after === 'খাতাটা নতুন') throw new Error('still says the book is new after a day was saved')
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
  await step('evening: "এই কাজের টাকা পেলেন?" comes after the other spending', page, async () => { await toReceived(page) })
  await step('evening: ₹5,000 in cash for the job is written down', page, async () => {
    await yes(page)
    await page.getByText('কত পেলেন?').waitFor({ timeout: 3000 })
    await pad(page, ['৫', '০', '০', '০'])
    await tap(page, 'যোগ করুন', true)
    await page.getByText('এই কাজের টাকা পেলেন?').waitFor({ timeout: 3000 })
    await next(page)
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
    await no(page)
    await page.getByText('কাজ কতটা হয়েছে?').waitFor({ timeout: 3000 })
    const d = await page.evaluate(async () => (await (await import('/src/lib/draft.ts')).loadDraft()))
    if ((d.recv || []).length) throw new Error('a received row was drafted')
  })
  await ctx.close()
}

/* ---- B1: with no live job there is no job to pick, and no one to have paid for one ---- */
{
  const { ctx, page } = await fresh({ jobStatus: 'done' })
  await step('evening: with no live job neither question is asked', page, async () => {
    await page.locator('[data-tour="today"]').click()
    await page.getByText('নিজের বা সংসারের কোনো খরচ?').waitFor({ timeout: 4000 })
    if (await page.getByText('আজ কোন কাজের হিসাব লিখবেন?').count()) throw new Error('asked which job with no live job')
    if (await page.getByText('এই কাজের টাকা পেলেন?').count()) throw new Error('asked about money with no live job')
  })
  await ctx.close()
}

/* ---- B2: "টাকা পেলাম" in হিসাব, by UPI ---- */
{
  const { ctx, page } = await fresh()
  await step('হিসাব: "টাকা পেলাম" by UPI counts for the job, not in the cash box', page, async () => {
    await tabBtn(page, 'টাকা').click()
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
    await tabBtn(page, 'দোকান').click()
    await toWho(page, 'মাল বিক্রি', ['২'], ['১', '০', '০'])
    await tap(page, '+ নতুন', true)
    await page.getByText('কত দিনে টাকা দেয় (না জানলে ০)').waitFor({ timeout: 3000 })
    await page.locator('.sheet .iconbtn, .sheet [aria-label="বন্ধ করুন"]').first().click().catch(() => page.keyboard.press('Escape'))
  })
  await step('shop: a credit sale to a customer with no agreed days falls due in a week', page, async () => {
    await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    await tabBtn(page, 'দোকান').click()
    await toWho(page, 'মাল বিক্রি', ['২'], ['১', '০', '০'])
    await tap(page, 'হালদার', true)
    await tap(page, 'না, বাকি')
    await page.getByText('কবে দেবে?').waitFor({ timeout: 3000 })
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    const r = await lastStock(page, 'sale')
    if (r.due !== r.in7) throw new Error('due ' + r.due + ', not ' + r.in7)
  })
  await step('shop: a credit purchase cannot be saved without a supplier', page, async () => {
    await toWho(page, 'মাল এল', ['৫'], ['৮', '০'])
    await tap(page, 'না, বাকি')
    if (await page.locator('.actionbar .btn.primary').isEnabled()) throw new Error('a credit purchase with no supplier could be saved')
  })
  await step("shop: with the supplier picked it falls due on the supplier's own days", page, async () => {
    await tap(page, 'শর্মা', true)
    await page.getByText('কবে দেবেন?').waitFor({ timeout: 3000 })
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
    await tabBtn(page, 'দোকান').click()
    await page.getByText('মাল বিক্রি').first().waitFor({ timeout: 3000 })
    await page.getByText('বাকিতে দিলাম').first().waitFor({ timeout: 3000 })
  })
  await step('shop: "বাকিতে দিলাম" ₹800 to a customer, due in a fortnight, moves no stock', page, async () => {
    const before = await page.evaluate(async () => { const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts'); const s = m.getState(); return JSON.stringify(c.shopStock(s.entries, m.items(s))) })
    await tap(page, 'বাকিতে দিলাম')
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
    await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    await tabBtn(page, 'টাকা').click()
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
    await tabBtn(page, 'টাকা').click()
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
  await step('settings: two groups, his first — নাম ও ফোন is his, অনলাইন খাতা the helper\'s', page, async () => {
    await page.getByLabel('সেটিংস').click()
    const group = (name) => page.locator(`.scroll p.sectionlabel:has-text("${name}") + .rowlist`)
    const want = [['আপনার জন্য', 'নাম ও ফোন'], ['আপনার জন্য', 'মনে করিয়ে দেওয়া'], ['সাহায্যকারীর জন্য', 'অনলাইন খাতা'],
      ['সাহায্যকারীর জন্য', 'গুগলের চাবি'], ['সাহায্যকারীর জন্য', 'কাজ আর দোকান']]
    for (const [g, row] of want) if (!(await group(g).locator('.pick', { hasText: row }).count())) throw new Error(row + ' is not under ' + g)
    const first = await page.locator('.scroll p.sectionlabel').first().innerText()
    if (first.trim() !== 'আপনার জন্য') throw new Error('the first group is ' + first)
  })
  await step('settings: names and phone numbers are kept on a page of their own', page, async () => {
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

/* ---- a phone that took build 26's walk round has never seen the tabs: it takes the walk round once more ---- */
{
  const { ctx, page } = await fresh()
  await step('update: a phone that took the old walk round gets the new one, once', page, async () => {
    // Settings as build 26 stored them: walk round done, and no word of the tab layout.
    await page.evaluate(async () => {
      const db = await import('/src/lib/db.ts')
      const st = await db.kvGet('settings', null)
      delete st.layout_seen
      await db.kvSet('settings', { ...st, toured: true })
    })
    await page.reload()
    await page.locator('.tour').waitFor({ timeout: 5000 })
    for (let k = 0; k < 4 && (await page.locator('.tour').count()); k++) { await page.locator('.tour-card .btn.primary').click(); await page.waitForTimeout(300) }
    await page.reload(); await page.waitForTimeout(1600)
    if (await page.locator('.tour').count()) throw new Error('the walk round came back a second time')
  })
  await ctx.close()
}

/* ---- reminders: four switches, each on its own ---- */
{
  const { ctx, page } = await fresh()
  await step('settings: মনে করিয়ে দেওয়া has four switches, and turning আজকের কথা off is saved', page, async () => {
    await page.getByLabel('সেটিংস').click()
    const row = page.locator('.pick', { hasText: 'মনে করিয়ে দেওয়া' })
    if (!(await row.innerText()).includes('চারটেই চালু')) throw new Error('the row reads: ' + (await row.innerText()))
    await row.click()
    for (const w of ['আজকের কথা', 'হিসাব লেখার কথা', 'কে কত টাকা দেবে', 'বাকির তারিখ']) {
      if (!(await page.locator('.pick', { hasText: w }).count())) throw new Error('no switch for ' + w)
    }
    await page.locator('.pick', { hasText: 'আজকের কথা' }).click()
    await page.waitForTimeout(300)
    const on = await page.evaluate(async () => (await import('/src/lib/store.ts')).getState().settings.notify_morning)
    if (on !== false) throw new Error('notify_morning is ' + on)
    await page.evaluate(() => window.__shellBack())
    await page.waitForTimeout(300)
    const after = await page.locator('.pick', { hasText: 'মনে করিয়ে দেওয়া' }).innerText()
    if (!after.includes('৩টে চালু')) throw new Error('after one is off the row reads: ' + after)
  })
  await step('settings: due dates switched off leave the Monday switch on', page, async () => {
    await page.locator('.pick', { hasText: 'মনে করিয়ে দেওয়া' }).click()
    await page.locator('.pick', { hasText: 'বাকির তারিখ' }).click()
    await page.waitForTimeout(300)
    const st = await page.evaluate(async () => { const s = (await import('/src/lib/store.ts')).getState().settings; return s.remind + '|' + s.notify_monday })
    if (st !== 'off|true') throw new Error('saved: ' + st)
    if (!(await page.locator('.pick.on', { hasText: 'কে কত টাকা দেবে' }).count())) throw new Error('the Monday switch shows off')
  })
  await ctx.close()
}

/* ---- C1: a new job asks its kind, contract, what came in so far, and how much is done ---- */
{
  const { ctx, page } = await fresh()
  await step('new job: kind, contract, received so far and how much is done are all written', page, async () => {
    await page.evaluate(async () => { await (await import('/src/lib/seed.ts')).seedKinds([]) })
    await tabBtn(page, 'কাজ').click()
    await tap(page, '+ নতুন কাজ')
    await page.locator('.sheet .field', { hasText: 'কাজের নাম' }).locator('input').fill('নতুন সাইট')
    await page.locator('.sheet .chip', { hasText: 'রঙের কাজ' }).click()
    await page.locator('.sheet .field', { hasText: 'চুক্তি কত টাকার?' }).locator('input').fill('1000000')
    await page.locator('.sheet .field', { hasText: 'এ পর্যন্ত কত পেয়েছেন?' }).locator('input').fill('200000')
    await page.locator('.sheet input[type=range]').fill('30')
    const said = await page.locator('.sheet .field', { hasText: 'কাজ কতটা হয়েছে?' }).innerText()
    if (!said.includes('৩০%') || !said.includes('এখন চলছে: ঘষা ও পুটি')) throw new Error('the slider line reads: ' + said.replace(/\n+/g, ' | '))
    await page.locator('.sheet .btn.primary').last().click()
    await page.waitForTimeout(500)
    const r = await page.evaluate(async () => {
      const m = await import('/src/lib/store.ts'); const c = await import('/src/lib/calc.ts')
      const s = m.getState(); const p = s.masters.find((x) => x.kind === 'project' && x.name_bn === 'নতুন সাইট')
      if (!p) return null
      const tt = c.projectTotals(p, s.entries, m.stages(s))
      return { budget: p.budget, kind: p.ptype, received: tt.received, pct: Math.round(tt.pct_done), cash: c.cashState(s.entries, s.settings.opening_cash, s.settings.opening_date).computed }
    })
    if (!r || r.budget !== 1000000 || r.kind !== 'রং' || r.received !== 200000 || r.pct !== 30 || r.cash !== 10000) throw new Error(JSON.stringify(r))
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
      await m.saveEntries(js.jobStartRows('p1', 23, 200000))
      await m.saveEntries([{ id: db.uid(), kind: 'money', batch: db.uid(), date: (await import('/src/lib/bn.ts')).isoDate(), project_id: 'p1', created_at: new Date().toISOString(), head_bn: 'ঠিকা কাজ', dir: 'paid', amount: 50000, party_id: '', mode: 'নগদ', note: '', personal: false, photo_id: '' }])
      return !!(await import('/src/lib/brief.ts')).localBrief().series?.scurve
    })
    await tabBtn(page, 'কাজ').click()
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
  await step('setup: with neither contract work nor a shop ticked, setup holds', page, async () => {
    await page.locator('.app[data-screen="setup"]').waitFor({ timeout: 8000 })
    await tap(page, 'শুরু করি')
    await page.getByText('আপনার নাম কী?').waitFor({ timeout: 4000 })
    await page.locator('input.input').first().fill('বিমল'); await tap(page, 'এগিয়ে যান')
    await page.getByText('আপনি কী কী করেন?').waitFor({ timeout: 4000 })
    const next = page.locator('.actionbar .btn.primary')
    await tap(page, 'ঠিকাদারির কাজ'); await tap(page, 'মাল কেনা-বেচা')
    if (await next.isEnabled()) throw new Error('setup goes on with nothing ticked')
    await tap(page, 'ঠিকাদারির কাজ'); await tap(page, 'মাল কেনা-বেচা')
    if (!(await next.isEnabled())) throw new Error('setup is held with both ticked again')
  })

  await step('setup: a man named without a wage cannot be passed', page, async () => {
    await tap(page, 'এগিয়ে যান')
    await page.getByText('এখন কোন কোন কাজ চলছে?').waitFor({ timeout: 4000 }); await tap(page, 'এখন কোনো কাজ নেই')
    await page.getByText('কাদের মজুরি দেন?').waitFor({ timeout: 4000 })
    await page.locator('input.input').nth(0).fill('রতন')
    if (await page.locator('.actionbar .btn.primary').isEnabled()) throw new Error('a man with no wage could be passed')
    if (!(await page.getByText('মজুরি না দিলে হিসাব ভুল হবে।').count())) throw new Error('no line saying why')
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
    await tabBtn(page, 'দোকান').click()
    await tap(page, 'বাকিতে দিলাম')
    await pickTenth()
    await pad(page, ['৫', '০', '০'])
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    if ((await partyOf('sale')) !== 'cc10') throw new Error('sold to ' + (await partyOf('sale')))
  })
  await step('people: a sale of goods can reach the tenth customer', page, async () => {
    await toWho(page, 'মাল বিক্রি', ['১'], ['১', '০', '০'])
    await pickTenth()
    await tap(page, 'হ্যাঁ', true)
    await page.locator('.actionbar .btn.primary').click()
    await page.waitForTimeout(400)
    if ((await partyOf('sale')) !== 'cc10') throw new Error('sold to ' + (await partyOf('sale')))
  })
  await step('people: an old balance can reach the tenth customer', page, async () => {
    await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    await tabBtn(page, 'টাকা').click()
    await tap(page, 'কাগজের খাতার পুরোনো বাকি', true)
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
    await tabBtn(page, 'টাকা').click()
    await tap(page, 'কাগজের খাতার পুরোনো বাকি', true)
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
    await tap(page, 'কাগজের খাতার পুরোনো বাকি', true)
    await tap(page, 'আমি ওনাকে দেব')
    await tap(page, 'শর্মা', true)
    await pad(page, ['১', '২', '০', '০'])
    await page.locator('.sheet .btn.primary').last().click()
    await page.waitForTimeout(500)
    const r = await lastRow(page, 'opening_owe')
    if (!r || r.amount !== 1200 || r.party_id !== 's1' || r.due_date !== r.in15) throw new Error('row: ' + JSON.stringify(r))
    const txt = await listText(page)
    if (!txt.includes('টাকা দেবেন') || !txt.includes('১,২০০')) throw new Error('দেবেন does not show ₹1,200')
  })
  await step("old dues: they are not this month's spending", page, async () => {
    await page.goto(ORIGIN); await page.locator('[data-tour="today"]').waitFor({ timeout: 5000 })
    await tabBtn(page, 'টাকা').click()
    const spend = await page.locator('.topbar .sub').innerText()
    if (!spend.includes('₹০')) throw new Error('month spend: ' + spend)
    const txt = await listText(page)
    if (!txt.includes('পুরোনো বাকি')) throw new Error('the dues list does not name the old balance')
  })
  await ctx.close()
}

/* ---- B3: the cash count stops blaming him ---- */
const toCount = async (page, counted) => {
  await toReceived(page)
  await no(page)
  await page.getByText('কাজ কতটা হয়েছে?').waitFor({ timeout: 3000 }); await next(page)
  await page.getByText('নিজের বা সংসারের কোনো খরচ?').waitFor({ timeout: 3000 }); await no(page)
  await page.getByText('এখন হাতে কত টাকা?').waitFor({ timeout: 3000 })
  await tap(page, 'না, গুনে বলছি')
  await pad(page, counted)
  await next(page)
  await page.waitForTimeout(300)
}
{
  const { ctx, page } = await fresh()
  await step('cash: ₹3,000 more than the book offers to write the money received', page, async () => {
    await toCount(page, ['১', '৩', '০', '০', '০'])
    if (!(await page.getByText('খাতার চেয়ে ₹৩,০০০ বেশি। কেউ টাকা দিয়েছেন?').count())) throw new Error('no question about money received')
    if (await page.getByText('কোনো খরচ বাদ গেছে?', { exact: false }).count()) throw new Error('asked about a forgotten expense when he has MORE')
    await tap(page, 'হ্যাঁ, লিখে দিই')
    await page.getByText('কোন কাজের টাকা?').waitFor({ timeout: 3000 })
    await pad(page, ['৩', '০', '০', '০'])
    await tap(page, 'যোগ করুন', true)
    await page.getByText('এখন হাতে কত টাকা?').waitFor({ timeout: 3000 })
    const b = await page.evaluate(async () => ((await (await import('/src/lib/draft.ts')).loadDraft()) || {}).recv?.map((r) => r.project_id + ':' + r.amount).join())
    if (b !== 'p1:3000') throw new Error('the money written from the count: ' + b)
  })
  await ctx.close()
}
{
  const { ctx, page } = await fresh()
  await step('cash: ₹3,000 less than the book asks about a forgotten expense', page, async () => {
    await toCount(page, ['৭', '০', '০', '০'])
    if (!(await page.getByText('খাতার চেয়ে ₹৩,০০০ কম। কোনো খরচ বাদ গেছে?').count())) throw new Error('no question about a forgotten expense')
    if (await page.getByText('হ্যাঁ, লিখে দিই').count()) throw new Error('offered money received when he has LESS')
  })
  await ctx.close()
}

console.log(log.join('\n'))
await browser.close()
await server.close()
process.exit(log.some((l) => l.startsWith('FAIL') || l.startsWith('PAGEERROR')) ? 1 : 0)
