/* The audit: is the arithmetic right, and do the two halves agree?

   The numbers on his phone come from two places that were written separately:
   calc.ts (the phone's own sums, shown on the home screen) and summary.js (the
   server's sums, which the nightly brief and the dashboard are built from).
   If they disagree, he sees two answers to the same question on one screen.

   So this builds one ledger through the app's own row-building code, works out
   what every figure SHOULD be by hand (written down below, with the sums), and
   checks both halves against that — not against each other, because two
   implementations can agree and both be wrong.

   The app's real TypeScript is bundled on the fly; nothing is re-implemented
   here. `npm run audit`, and it is part of `npm test`. */

process.env.TZ = 'Asia/Kolkata'

import { build } from 'vite'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import { openLedger } from '../nightly/ledger-sql.mjs'
import { buildSummary } from '../server/src/summary.js'
import { cards, groupIndian, money, projectStatus, skeleton } from '../nightly/compute.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0, fail = 0
const ck = (name, got, want, tol = 0) => {
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tol : String(got) === String(want)
  if (ok) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}

/* ---------- the app's own code, bundled ---------- */

const out = mkdtempSync(join(tmpdir(), 'sitekhata-audit-'))
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: {
    outDir: out, emptyOutDir: true, minify: false, target: 'es2022', sourcemap: false,
    lib: { entry: { calc: 'src/lib/calc.ts', model: 'src/lib/model.ts', draft: 'src/lib/draft.ts', bn: 'src/lib/bn.ts', monthly: 'src/lib/monthly.ts', restore: 'src/lib/restore.ts', sync: 'src/lib/sync.ts', remind: 'src/lib/remind.ts' }, formats: ['es'] },
  },
})
const load = (n) => import(pathToFileURL(join(out, n + '.js')).href)
const [calc, model, draft, bn, monthly, restore, sync, remind] = await Promise.all(['calc', 'model', 'draft', 'bn', 'monthly', 'restore', 'sync', 'remind'].map(load))

const SQL = await initSqlJs()
const schemaSql = readFileSync(join(ROOT, 'server/schema.sql'), 'utf8')

/* ---------- a clock that stands still ---------- */

const RealDate = Date
function freeze(iso) {
  const t0 = RealDate.parse(iso)
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(t0); else super(...a) }
    static now() { return t0 }
  }
}
const thaw = () => { globalThis.Date = RealDate }

/* ---------- building a ledger ---------- */

let n = 0
const id = (p) => `${p}${++n}`
let clock = 0
const stamp = () => new RealDate(RealDate.parse('2026-09-01T00:00:00Z') + (++clock) * 1000).toISOString()

const master = (kind, rec) => ({ id: id(kind[0]), kind, updated_at: stamp(), ...rec })

function ledger(fn) {
  const masters = []
  const entries = []
  fn({ masters, entries })
  return { masters, entries }
}

const stockRow = (o) => ({ id: id('st'), kind: 'stock', batch: id('b'), project_id: '', party_id: '', due_date: '', paid: true, photo_id: '', created_at: stamp(), amount: Math.round((o.qty || 0) * (o.rate || 0) * 100) / 100, ...o })
const moneyRow = (o) => ({ id: id('mo'), kind: 'money', batch: id('b'), project_id: '', party_id: '', mode: 'নগদ', note: '', personal: false, photo_id: '', created_at: stamp(), ...o })

async function serverSummary(L) {
  const rows = [...L.masters.map(model.rowForMaster), ...L.entries.map(model.rowForEntry)]
  const led = openLedger(SQL, schemaSql, rows)
  try { return await buildSummary(led.db, 'phone') } finally { led.close() }
}

const HOUSE = 'বাড়ি'
const totalStock = (L) => calc.shopStock(L.entries, L.masters.filter((m) => m.kind === 'item')).reduce((a, l) => a + l.value, 0)

/* =====================================================================
   THE LEDGER.   Today is Thu 3 Sep 2026, half past one in the afternoon, IST.
   d(n) is n days ago.
   ===================================================================== */

freeze('2026-09-03T08:00:00Z')
const T = bn.isoDate()
const d = (k) => bn.addDays(T, -k)
ck('the frozen clock reads 3 September in Kolkata', T, '2026-09-03')

const A = ledger(({ masters, entries }) => {
  masters.push(
    { id: 'p1', kind: 'project', name_bn: 'রায়বাড়ি', client_bn: 'সুবীর রায়', ptype: HOUSE, area_sqft: 1000, budget: 1000000, start_date: d(60), plan_days: 180, status: 'active', updated_at: stamp() },
    { id: 'w1', kind: 'worker', name_bn: 'রহিম', rate: 700, phone: '', active: true, updated_at: stamp() },
    { id: 'w2', kind: 'worker', name_bn: 'গোপাল', rate: 500, phone: '', active: true, updated_at: stamp() },
    { id: 'i1', kind: 'item', name_bn: 'সিমেন্ট', unit_bn: 'বস্তা', last_rate: 400, active: true, updated_at: stamp() },
    { id: 'i2', kind: 'item', name_bn: 'রড', unit_bn: 'কেজি', last_rate: 68, active: true, updated_at: stamp() },
    { id: 'i3', kind: 'item', name_bn: 'পাইপ', unit_bn: 'পিস', last_rate: 100, active: true, updated_at: stamp() },
    { id: 's1', kind: 'party', name_bn: 'শর্মা ট্রেডার্স', ptype: 'supplier', terms_days: 15, phone: '', updated_at: stamp() },
    { id: 'c1', kind: 'party', name_bn: 'মণ্ডল', ptype: 'client', terms_days: 7, phone: '', updated_at: stamp() },
  )
  ;[['ভিত', 20], ['ছাদ', 30], ['দেওয়াল', 25], ['ফিনিশিং', 25]].forEach(([name_bn, weight], i) =>
    masters.push({ id: 'st' + i, kind: 'stage', project_type: HOUSE, seq: i + 1, name_bn, weight, updated_at: stamp() }))

  /* d(20): a full working day on the site, written through the wizard's own
     builder. Rahim a full day (700). Gopal a half day (250) and took 100 in
     advance. Cement on credit. Tea in cash. The foundation is done. Cash counted. */
  const dr = draft.newDraft(d(20), 'p1')
  dr.att = { w1: { presence: 'full', rate: 700, amount: 700, advance: 0 }, w2: { presence: 'half', rate: 500, amount: 250, advance: 100 } }
  dr.mats = [{ key: 'k1', item_id: 'i1', qty: 100, rate: 400, party_id: 's1', due_date: d(5), paid: false, photo_id: '' }]
  dr.exps = [{ key: 'x1', head_bn: 'চা-জলখাবার', amount: 120, mode: 'নগদ', note: '', photo_id: '' }]
  dr.progress = { stage_seq: 1, state: 'done' }
  dr.cash_counted = 50000; dr.cash_computed = 50000
  entries.push(...draft.buildEntries(dr))

  /* The shop. */
  entries.push(stockRow({ date: d(18), item_id: 'i3', dir: 'in', qty: 50, rate: 100, paid: true }))                       // 5,000 cash
  entries.push(stockRow({ date: d(17), item_id: 'i3', dir: 'in', qty: 50, rate: 120, paid: false, party_id: 's1', due_date: d(3) })) // 6,000 owed, overdue
  entries.push(stockRow({ date: d(15), item_id: 'i3', dir: 'sale', qty: 30, rate: 150, paid: true }))                    // 4,500 cash
  entries.push(stockRow({ date: d(14), item_id: 'i3', dir: 'sale', qty: 10, rate: 150, paid: false, party_id: 'c1', due_date: d(2) })) // 1,500 owed to him
  entries.push(stockRow({ date: d(10), item_id: 'i3', dir: 'transfer', qty: 20, rate: 120, project_id: 'p1' }))          // sent to the site at cost
  // Material coming back off the site, through the wizard's own builder.
  const back = draft.newDraft(d(8), 'p1')
  back.rets = [{ key: 'r1', item_id: 'i3', qty: 5, rate: 120 }]
  entries.push(...draft.buildEntries(back))

  /* Money. */
  entries.push(moneyRow({ date: d(4), head_bn: 'বাকি মেটানো', dir: 'paid', amount: 3000, party_id: 's1' }))            // pays Sharma 3,000
  entries.push(moneyRow({ date: d(1), head_bn: 'বাকি মেটানো', dir: 'received', amount: 500, party_id: 'c1' }))         // Mondal pays 500
  entries.push(moneyRow({ date: d(6), head_bn: 'ব্যবসা থেকে নেওয়া', dir: 'paid', amount: 2000, personal: true }))     // drawing
  entries.push(moneyRow({ date: d(6), head_bn: 'বাজার', dir: 'paid', amount: 800, personal: true }))                    // household shopping

  /* A purchase written down by mistake, then corrected. It must leave no trace. */
  const slip = stockRow({ date: d(7), item_id: 'i2', dir: 'in', qty: 10, rate: 400, paid: false, party_id: 's1', due_date: d(7) })
  entries.push(slip, draft.reversalOf(slip))

  /* A later cash count that was then corrected away: the count from d(20) stands. */
  const recount = draft.newDraft(d(2), 'p1')
  recount.cash_counted = 40000; recount.cash_computed = 44000
  const recountRows = draft.buildEntries(recount)
  entries.push(...recountRows, draft.reversalOf(recountRows.find((e) => e.kind === 'day')))
})

const items = A.masters.filter((m) => m.kind === 'item')
const p1 = A.masters.find((m) => m.id === 'p1')
const stages = A.masters.filter((m) => m.kind === 'stage')

/* ---------- by hand ----------

   CASH.  Last live count: 50,000 on d(20). Everything dated after it:
     + 4,500  cash sale                      − 5,000  shop purchase paid in cash
     +   500  Mondal pays                    − 3,000  paid Sharma
                                             − 2,000  drawing
   Sending goods from the shop to a site, and taking them back, moves nothing
   out of his pocket. The 800 of household shopping is not the business's cash.
   The unpaid purchases and the credit sale have not moved cash yet.
   50,000 + 4,500 + 500 − 5,000 − 3,000 − 2,000 = 45,000

   DUES.  Sharma is owed 40,000 (cement, due d(5)) and 6,000 (pipes, due d(3));
   the 4,000 slip was cancelled. His 3,000 payment lands on the oldest bill
   first: 37,000 + 6,000 = 43,000, both past their date.
   OWED TO HIM.  Mondal 1,500 − 500 = 1,000, past its date.

   SHOP STOCK (pipes).  In 50 + 50. Out: sold 30 + 10, sent to site 20, less 5
   that came back. 100 − 40 − 15 = 45 left, valued at the last rate paid, 120:
   5,400.

   THE JOB.  Wages 950 (700 + 250; the 100 advance is a payment on account, not
   a cost). Material 40,000 cement + 2,400 pipes sent − 600 pipes back = 41,800.
   Other 120. Cost 42,870 of a 10,00,000 budget = 4.287%. Foundation (20 of 100)
   done = 20%. Earned 2,00,000; CPI 2,00,000 / 42,870 = 4.665. */

const E = {
  cash: 45000, dues: 43000, duesOverdue: 43000, duesWeek: 0, owed: 1000, owedOverdue: 1000,
  stockQty: 45, stockValue: 5400,
  labour: 950, material: 41800, other: 120, cost: 42870, pctDone: 20, pctSpent: 4.287, cpi: 4.665,
  counted: 50000,
}

/* ---------- the phone ---------- */

const phoneCash = calc.cashState(A.entries, 0, d(60))
ck('phone: cash in hand is rebuilt from the last live count', phoneCash.computed, E.cash)
ck('phone: the cancelled recount is ignored', phoneCash.anchor_amount, E.counted)
ck('phone: sending goods to a site moves no cash', phoneCash.out_since, 10000)

const phoneDues = calc.duesSplit(A.entries)
ck('phone: owed to shops', phoneDues.total, E.dues)
ck('phone: of which past its date', phoneDues.overdue, E.duesOverdue)
ck('phone: of which due this week', phoneDues.thisWeek, E.duesWeek)
const phoneOwed = calc.receivablesSplit(A.entries)
ck('phone: owed to him', phoneOwed.total, E.owed)
ck('phone: of which late', phoneOwed.overdue, E.owedOverdue)

const phoneStock = calc.shopStock(A.entries, items)
const pipes = phoneStock.find((l) => l.item_id === 'i3')
ck('phone: pipes left in the shop', pipes && pipes.qty, E.stockQty)
ck('phone: valued at the last rate paid', pipes && pipes.value, E.stockValue)

const pt = calc.projectTotals(p1, A.entries, stages)
ck('phone: job wages', pt.labour, E.labour)
ck('phone: job material, net of what came back', pt.material, E.material)
ck('phone: job other costs', pt.other, E.other)
ck('phone: job cost', pt.cost, E.cost)
ck('phone: job percent done', pt.pct_done, E.pctDone)
ck('phone: job percent spent', pt.pct_spent, E.pctSpent, 0.001)
ck('phone: job CPI', pt.cpi, E.cpi, 0.001)

/* ---------- the server ---------- */

const S = await serverSummary(A)
const sb = S.business
const sp = S.projects[0]
ck('server: cash counted is the last LIVE count', sb.cash_counted, E.counted)
ck('server: owed to shops', sb.dues_total, E.dues)
ck('server: of which past its date', sb.dues_overdue, E.duesOverdue)
ck('server: of which due this week', sb.dues_this_week, E.duesWeek)
ck('server: owed to him', sb.receivable_total, E.owed)
ck('server: of which late', sb.receivable_overdue, E.owedOverdue)
ck('server: shop stock is valued like the phone values it', sb.shop_stock_value, E.stockValue)
ck('server: job wages', sp.labour, E.labour)
ck('server: job material', sp.material, E.material)
ck('server: job other costs', sp.other, E.other)
ck('server: job cost', sp.cost, E.cost)
ck('server: job percent done', sp.pct_done, E.pctDone)
ck('server: job percent spent (to two places)', sp.pct_spent, E.pctSpent, 0.01)
ck('server: job CPI', sp.cpi, E.cpi, 0.001)
// Inside the last three days A holds one thing that stands (Mondal's payment, d(1)) and one day that was cancelled.
ck('server: a cancelled day is not counted as writing', sb.entries_last_3_days, 1)
ck('phone: a cancelled day is not counted as writing', calc.entriesInLastDays(A.entries, 3), 1)
ck('server: the last thing he wrote is the last thing that stands', sb.last_entry_date, d(1))
ck('phone: the last thing he wrote is the last thing that stands', calc.lastEntryDate(A.entries), d(1))

const C = ledger(({ entries }) => {
  const w = draft.newDraft(d(1), '')
  const rows = draft.buildEntries(w)
  entries.push(...rows, ...rows.map((r) => draft.reversalOf(r)))
})
ck('phone: a day entered and then cancelled is silence', calc.entriesInLastDays(C.entries, 3), 0)
ck('server: a day entered and then cancelled is silence', (await serverSummary(C)).business.entries_last_3_days, 0)
ck('phone: and there is no last entry', calc.lastEntryDate(C.entries), null)
ck('server: and there is no last entry', (await serverSummary(C)).business.last_entry_date, null)

// A man who only runs the shop writes no wizard day, but he is not silent.
const shopOnly = ledger(({ entries }) => { entries.push(stockRow({ date: d(1), item_id: 'i3', dir: 'sale', qty: 1, rate: 100 })) })
ck('server: a sale at the counter is writing', (await serverSummary(shopOnly)).business.entries_last_3_days, 1)
ck('phone: a sale at the counter is writing', calc.entriesInLastDays(shopOnly.entries, 3), 1)

/* The two halves, side by side: whatever the oracle says, they must agree. */
ck('phone and server agree on what is owed to shops', phoneDues.total, sb.dues_total)
ck('phone and server agree on what is owed to him', phoneOwed.total, sb.receivable_total)
ck('phone and server agree on the shop stock', phoneStock.reduce((a, l) => a + l.value, 0), sb.shop_stock_value)
ck('phone and server agree on the job status colour', pt.status, projectStatus(sp))

/* =====================================================================
   COUNTS.  A physical count replaces whatever the book said up to that day.
   ===================================================================== */

const B = ledger(({ masters, entries }) => {
  masters.push({ id: 'i4', kind: 'item', name_bn: 'আধা ইঞ্চি পাইপ', unit_bn: 'পিস', last_rate: 50, active: true, updated_at: stamp() })
  entries.push(stockRow({ date: d(30), item_id: 'i4', dir: 'in', qty: 100, rate: 50 }))
  // Two counts on the same day: the later one written is the one that stands.
  // They are stored in the "wrong" order on purpose — a phone hands rows back in id order, which is random.
  const later = stockRow({ date: d(20), item_id: 'i4', dir: 'count', qty: 70, rate: 55 })
  const earlier = stockRow({ date: d(20), item_id: 'i4', dir: 'count', qty: 90, rate: 55, created_at: '2026-08-01T00:00:00.000Z' })
  entries.push(later, earlier)
  entries.push(stockRow({ date: d(20), item_id: 'i4', dir: 'sale', qty: 4, rate: 80 }))   // on the count day: already in the count
  entries.push(stockRow({ date: d(10), item_id: 'i4', dir: 'in', qty: 10, rate: 60 }))
  entries.push(stockRow({ date: d(5), item_id: 'i4', dir: 'sale', qty: 5, rate: 80 }))
})
const bItems = B.masters
const bs = calc.shopStock(B.entries, bItems)[0]
ck('counts: the later of two counts on one day stands, and what came after is added', bs.qty, 75)   // 70 + 10 − 5
ck('counts: valued at the latest rate paid after the count', bs.value, 4500)                        // 75 × 60
const bSrv = await serverSummary(B)
ck('counts: the server values the shop the same way', bSrv.business.shop_stock_value, 4500)

// The same count, with the rows in the other order, must give the same answer.
const bRev = calc.shopStock([...B.entries].reverse(), bItems)[0]
ck('counts: row order makes no difference', bRev.qty, 75)

/* =====================================================================
   EDGES.  Every one of these has to come out as a number, not a crash.
   ===================================================================== */

const none = calc.projectTotals({ ...p1, budget: 0 }, [], stages)
ck('an empty ledger: every number in a job is a real number', Object.values(none).filter((v) => typeof v === 'number').every(Number.isFinite), true)
ck('no budget: percent spent is 0, not infinity', none.pct_spent, 0)
ck('no budget: CPI is absent, not infinity', none.cpi, null)
ck('no budget: profit is absent', none.profit, null)
ck('no stages for the job type: percent done is 0', calc.projectPct({ ...p1, ptype: 'নেই' }, [], stages), 0)
ck('stage weights that sum to zero do not divide by zero', calc.projectPct(p1, [], stages.map((s) => ({ ...s, weight: 0 }))), 0)
ck('empty ledger: cash is the opening balance', calc.cashState([], 1234, d(1)).computed, 1234)
ck('empty ledger: nothing owed', calc.duesSplit([]).total, 0)
ck('empty ledger: no stock', calc.shopStock([], items).length, 0)
ck('empty ledger: no days written', calc.entriesInLastDays([], 3), 0)

const overpay = ledger(({ entries }) => {
  entries.push(stockRow({ date: d(5), item_id: 'i1', dir: 'in', qty: 10, rate: 100, paid: false, party_id: 's1', due_date: d(1) }))
  entries.push(moneyRow({ date: d(2), head_bn: 'বাকি মেটানো', dir: 'paid', amount: 5000, party_id: 's1' }))
})
ck('paying more than is owed leaves nothing owed, not a negative', calc.duesSplit(overpay.entries).total, 0)
const otherParty = ledger(({ entries }) => {
  entries.push(stockRow({ date: d(5), item_id: 'i1', dir: 'in', qty: 10, rate: 100, paid: false, party_id: 's1', due_date: d(1) }))
  entries.push(moneyRow({ date: d(2), head_bn: 'বাকি মেটানো', dir: 'paid', amount: 400, party_id: 's2' }))
})
ck("paying one shop does not reduce another's bill", calc.duesSplit(otherParty.entries).total, 1000)
ck('the settlement is not counted as a job cost', calc.projectTotals(p1, [moneyRow({ date: d(1), project_id: 'p1', head_bn: 'বাকি মেটানো', dir: 'paid', amount: 999 })], stages).cost, 0)
const cents = ledger(({ entries }) => {
  entries.push(stockRow({ date: d(5), item_id: 'i1', dir: 'in', qty: 3, rate: 33.37, paid: false, party_id: 's1', due_date: d(1) }))
  entries.push(stockRow({ date: d(5), item_id: 'i1', dir: 'in', qty: 7, rate: 14.29, paid: false, party_id: 's1', due_date: d(1) }))
})
ck('paise add up without drifting', Math.round(calc.duesSplit(cents.entries).total * 100) / 100, 200.14)  // 3 × 33.37 = 100.11, 7 × 14.29 = 100.03

/* Dates. */
ck('addDays: end of February in a leap year', bn.addDays('2028-02-28', 1), '2028-02-29')
ck('addDays: end of February otherwise', bn.addDays('2026-02-28', 1), '2026-03-01')
ck('addDays: across the new year', bn.addDays('2026-12-31', 1), '2027-01-01')
ck('addDays: backwards across a month', bn.addDays('2026-03-01', -1), '2026-02-28')
ck('daysBetween: a leap year', bn.daysBetween('2028-02-28', '2028-03-01'), 2)
ck('Bengali digits are digits', bn.parseNum('১,২৫০.৫০'), 1250.5)
ck('a rupee sign and spaces are ignored', bn.parseNum(' ₹ 1 250 '), 1250)
ck('nonsense is not a number', bn.parseNum('12a'), null)
ck('nothing is not zero', bn.parseNum(''), null)
ck('Indian grouping at a lakh', bn.groupIndian(100000), '1,00,000')
ck('Indian grouping at a crore', bn.groupIndian(12345678), '1,23,45,678')
ck('a negative amount keeps its sign', bn.groupIndian(-1234567), '-12,34,567')
ck('money rounds to whole rupees', bn.money(0.4).replace(/[০-৯]/g, '0'), '₹0')
ck('and a tiny negative is not "-0"', bn.money(-0.4).includes('-'), false)

/* Monthly bills: rent on the 31st must come back on the 31st, not slide to the 28th for ever. */
let due = '2026-01-31', rep = 'monthly'
const seq = []
for (let i = 0; i < 4; i++) { const nx = monthly.nextDue(due, rep); seq.push(nx.due_date); due = nx.due_date; rep = nx.repeat }
ck('a bill due on the 31st: Feb, Mar, Apr, May', seq.join(' '), '2026-02-28 2026-03-31 2026-04-30 2026-05-31')
ck('a bill due on the 15th is simply the 15th', monthly.nextDue('2026-12-15', 'monthly').due_date, '2027-01-15')
ck('and stays plain "monthly"', monthly.nextDue('2026-12-15', 'monthly').repeat, 'monthly')
ck('a pulled-back bill remembers its day', monthly.nextDue('2026-01-31', 'monthly').repeat, 'monthly@31')
ck('"monthly@31" is monthly', monthly.isMonthly('monthly@31') && monthly.isMonthly('monthly') && !monthly.isMonthly('once') && !monthly.isMonthly(''), true)
ck('a leap year gets the 29th', monthly.nextDue('2028-01-31', 'monthly').due_date, '2028-02-29')

/* =====================================================================
   COMING BACK.  A phone that is replaced pulls everything down from the server.
   ===================================================================== */

const asServerSends = (row) => row.values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === '' ? null : v))

const bill = { id: 'b9', kind: 'bill', name_bn: 'ঘরভাড়া', to_bn: 'মালিক', amount: 4000, due_date: '2026-09-05', repeat: 'monthly@31', personal: true, paid_on: '', note: 'ফোন', updated_at: 't' }
const gotBill = restore.recordFromRow('Bills', asServerSends(model.rowForMaster(bill)))
ck('a bill comes back from the server as a master', gotBill && gotBill.isMaster && gotBill.rec.kind, 'bill')
ck('with its amount', gotBill && gotBill.rec.amount, 4000)
ck('its book (his own, not the business)', gotBill && gotBill.rec.personal, true)
ck('and the day he really means', gotBill && gotBill.rec.repeat, 'monthly@31')
ck('and its date', gotBill && gotBill.rec.due_date, '2026-09-05')

const live = model.rowForMaster(p1)
const dead = model.rowForMaster({ ...p1, deleted: true })
const statusAt = model.SHEET_COLUMNS.Projects.indexOf('status')
ck('a live job goes up as it is', live.values[statusAt], 'active')
ck('a deleted job goes up marked deleted', dead.values[statusAt], 'deleted')
ck('and the job on the phone is not touched by sending it', p1.status, 'active')
const back = restore.recordFromRow('Projects', asServerSends(dead))
ck('a deleted job stays deleted when it comes back', back && back.rec.deleted, true)
ck('and is not resurrected as a running job', back && back.rec.status, 'done')
ck('a live job comes back live', restore.recordFromRow('Projects', asServerSends(live)).rec.deleted, undefined)
ck('a row with no id is refused', restore.recordFromRow('Workers', ['', 'x']), null)
ck('and so is a tab nobody knows', restore.recordFromRow('Nonsense', ['a', 'b']), null)

const gone = ledger(({ masters, entries }) => {
  masters.push({ ...p1 }, { ...p1, id: 'p2', name_bn: 'মুছে ফেলা কাজ', deleted: true })
  entries.push(stockRow({ date: d(2), project_id: 'p2', item_id: 'i1', dir: 'in', qty: 1, rate: 100 }))
})
const goneSummary = await serverSummary(gone)
ck('the server leaves a deleted job out of every figure', goneSummary.projects.map((q) => q.id).join(','), 'p1')

/* =====================================================================
   THE QUEUE.  Rows wait to be sent; a refused row must not hold up the rest.
   ===================================================================== */

const qrow = (id, extra = {}) => ({ id, tab: 'Money', mode: 'append', values: [], tries: 0, last_error: '', created_at: '', ...extra })
const refused = Array.from({ length: 45 }, (_, i) => qrow('bad' + i, { tries: 6, last_error: 'unknown tab', rejected: true }))
const queued = [...refused, qrow('good1'), qrow('good2')]
const next = sync.pickBatch(queued)
ck('forty-five refused rows in front do not stop the good ones', next.slice(0, 2).map((r) => r.id).join(','), 'good1,good2')
ck('a batch is never longer than forty', next.length, 40)
ck('the refused rows still get their turn after', next[2].id, 'bad0')
const offline = [qrow('a', { tries: 4, last_error: 'no network' }), qrow('b')]
ck('a row that only failed for want of signal keeps its place', sync.pickBatch(offline).map((r) => r.id).join(','), 'a,b')
ck('an empty queue is an empty batch', sync.pickBatch([]).length, 0)

/* =====================================================================
   REMINDERS.  It is Thursday 3 September, half past one.
   ===================================================================== */

const owedOn = (due) => ledger(({ entries }) => { entries.push(stockRow({ date: d(3), item_id: 'i1', dir: 'in', qty: 1, rate: 1000, paid: false, party_id: 's1', due_date: due })) }).entries
const at = (r) => (r ? bn.isoDate(r.at) + ' ' + String(r.at.getHours()).padStart(2, '0') : 'none')
ck('a bill due in a week, "a day before": the morning before', at(remind.plan(owedOn(d(-7)), 'day')[0]), d(-6) + ' 09')
ck('a bill due tomorrow, "a day before", written this afternoon: still reminded, on the morning of the day', at(remind.plan(owedOn(d(-1)), 'day')[0]), d(-1) + ' 09')
ck('a bill due today, once the morning has passed: nothing to add — he is looking at it', at(remind.plan(owedOn(d(0)), 'same')[0]), 'none')
ck('a bill due tomorrow with the reminder on the day: tomorrow morning', at(remind.plan(owedOn(d(-1)), 'same')[0]), d(-1) + ' 09')
ck('a bill already overdue does not fire', at(remind.plan(owedOn(d(2)), 'day')[0]), 'none')
ck('reminders off means none', remind.plan(owedOn(d(-5)), 'off').length, 0)
ck('three days before, on a bill due in two days: falls back to the day', at(remind.plan(owedOn(d(-2)), 'three')[0]), d(-2) + ' 09')

thaw()

/* =====================================================================
   THE CLOCK.  Half past one in the night, IST, is still "yesterday" in UTC —
   which is what a Cloudflare Worker runs on. The server must say it is
   Thursday anyway, whatever zone it runs in.
   ===================================================================== */

freeze('2026-09-02T20:00:00Z')   // 3 Sep, 01:30 in Kolkata
const R = ledger(({ masters, entries }) => {
  masters.push({ id: 'b1', kind: 'bill', name_bn: 'ঘরভাড়া', to_bn: 'বাড়িওয়ালা', amount: 4000, due_date: '2026-09-02', repeat: 'once', personal: true, paid_on: '', note: '', updated_at: stamp() })
  entries.push(stockRow({ date: '2026-08-20', item_id: 'i1', dir: 'in', qty: 10, rate: 100, paid: false, party_id: 's1', due_date: '2026-09-02' }))
  const w = draft.newDraft('2026-09-03', '')
  w.cash_counted = 1000; w.cash_computed = 1000
  entries.push(...draft.buildEntries(w))
})
const rs = await serverSummary(R)
ck('after midnight in India the server already says 3 September', rs.period.to, '2026-09-03')
ck('and the week it reports ends today', rs.period.from, '2026-08-28')
ck('a bill due yesterday is overdue', rs.bills.personal.overdue, 4000)
ck("a supplier's date that was yesterday is overdue", rs.business.dues_overdue, 1000)
ck('the day written just after midnight counts', rs.business.entries_last_3_days, 1)

// The same answers from a machine set to UTC, as the Worker is.
if (typeof process.env.TZ === 'string') {
  process.env.TZ = 'UTC'
  if (new RealDate(0).getTimezoneOffset() === 0) {
    const ru = await serverSummary(R)
    ck('the server gives the same answers on a UTC machine: period', ru.period.to, '2026-09-03')
    ck('the server gives the same answers on a UTC machine: bills', ru.bills.personal.overdue, 4000)
    ck('the server gives the same answers on a UTC machine: dues', ru.business.dues_overdue, 1000)
    ck('the server gives the same answers on a UTC machine: days written', ru.business.entries_last_3_days, 1)
  } else {
    console.log('skip the UTC-machine checks (this platform will not switch time zone mid-run)')
  }
  process.env.TZ = 'Asia/Kolkata'
}
thaw()

/* =====================================================================
   THE CARDS.
   ===================================================================== */

ck('a tiny negative is not "₹-0" on a card', money(-0.4), '₹0')
ck('a real negative is kept', money(-1234), '₹-1,234')
ck('Indian grouping, server side too', groupIndian(12345678), '1,23,45,678')

const BUSY = {
  business: {
    cash_counted: 48200, cash_variance: 0, dues_total: 500, dues_overdue: 0, dues_this_week: 0,
    receivable_total: 0, receivable_overdue: 0, receivable_this_week: 0, shop_stock_value: 14000,
    spend_this_week: 100, wages_this_week: 50, spend_change_pct: 10,
    entries_last_3_days: 0, last_entry_date: '2026-08-01',
  },
  projects: [],
  bills: { personal: { total: 4000, overdue: 4000, this_week: 0, count: 1 } },
}
const busy = cards(BUSY)
ck('six cards are the most there is', busy.length <= 6, true)
ck('and the silence is among them, even when everything else has something to say', busy.some((c) => c.label_en === 'Nothing written'), true)

ck('a job a little under budget-pace is a warning, not an emergency', projectStatus({ budget: 100, cpi: 0.95, pct_spent: 40, pct_done: 40 }), 'warn')
ck('a job costing a tenth more than it earns is critical', projectStatus({ budget: 100, cpi: 0.85, pct_spent: 40, pct_done: 40 }), 'crit')
ck('a job on pace is fine', projectStatus({ budget: 100, cpi: 1.1, pct_spent: 40, pct_done: 40 }), 'ok')
ck('a job with no budget has no verdict', projectStatus({ budget: 0 }), 'info')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
