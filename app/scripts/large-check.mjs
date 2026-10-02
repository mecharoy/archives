/* The big-ledger check: does it still work, and still add up, after years of use?

   A site business writes a few thousand rows a year; a busy shop and four jobs
   can write 15,000. This builds ledgers of 10,000 to 80,000 rows through the same
   generator the fuzz check uses, then
     · times every figure the home screen shows, at each size, and checks that doubling the rows
       does not much more than double the time (a quadratic loop shows up as ×4),
     · times the phone's brief (the whole ledger loaded into SQLite inside the app, then summarised),
     · times the outbox, a restore, a backup and the Worker's own JavaScript pass,
     · and checks the figures on the biggest ledger against the answer key — a big ledger must not
       only be fast, it must still be right.

   Times here are for this PC. A cheap Android phone is several times slower, so the check judges the
   SHAPE of the growth, not the milliseconds; the milliseconds are printed so they can be judged by eye.

   LARGE_SIZES=4000,8000,16000,32000 (events; about 2.5 rows each)   npm run large */

process.env.TZ = 'Asia/Kolkata'

import { loadApp, freeze, rng } from './_app.mjs'
import { genLedger, reference } from './_ledger.mjs'
import { figuresFor } from './_figures.mjs'
import { openLedger } from '../nightly/ledger-sql.mjs'
import { buildSummary } from '../server/src/summary.js'
import { shopShelf } from '../server/src/stock.js'

const SIZES = (process.env.LARGE_SIZES || '4000,8000,16000,32000').split(',').map(Number)
const app = await loadApp()
const { calc, model, bn, restore, sync, remind, SQL, schemaSql } = app
const { phoneOf, disagreements } = figuresFor(app)

freeze('2026-09-03T08:00:00Z')
const TODAY = bn.isoDate()

let pass = 0, fail = 0
const ck = (name, ok, detail = '') => { if (ok) { pass++; console.log('ok   ' + name) } else { fail++; console.log(`FAIL ${name} ${detail}`) } }

const timed = (fn, reps = 9) => {
  let best = Infinity, out
  for (let i = 0; i < reps; i++) { const t = performance.now(); out = fn(); best = Math.min(best, performance.now() - t) }
  return { ms: best, out }
}
const timedOnce = async (fn) => { const t = performance.now(); const out = await fn(); return { ms: performance.now() - t, out } }
const f = (x) => (x < 10 ? x.toFixed(1) : String(Math.round(x))).padStart(6)

/* ---------- the ledgers ---------- */

const ledgers = []
for (const events of SIZES) {
  const t = performance.now()
  const L = genLedger(app, rng(7000 + events), events, { today: TODAY, projects: 5, parties: 25, items: 40, horizon: 400, ties: 0.02 })
  ledgers.push({ events, L, genMs: performance.now() - t })
}
console.log('rows per ledger:', ledgers.map((x) => x.L.entries.length).join(', '), '\n')

/* ---------- what the screens compute ---------- */

const ops = {
  'cash in hand': (L) => calc.cashState(L.entries, 0, L.opening.date),
  'owed to shops': (L) => calc.duesSplit(L.entries),
  'owed to him': (L) => calc.receivablesSplit(L.entries),
  'shop stock': (L) => calc.shopStock(L.entries, L.masters.filter((m) => m.kind === 'item')),
  'all jobs': (L) => { const st = L.masters.filter((m) => m.kind === 'stage'); return L.masters.filter((m) => m.kind === 'project').map((p) => calc.projectTotals(p, L.entries, st)) },
  'days written': (L) => [calc.entriesInLastDays(L.entries, 3), calc.lastEntryDate(L.entries)],
  'history list': (L) => { const m = new Map(); for (const e of calc.liveEntries(L.entries)) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e) } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 90) },
  'one shop\'s balance': (L) => calc.partyBalance(L.entries, 's0'),
  'reminders': (L) => remind.plan(L.entries, 'day', 9, []),
}
const HOME = ['cash in hand', 'owed to shops', 'owed to him', 'shop stock', 'all jobs', 'days written']

const rows = []
for (const { L } of ledgers) {
  const row = { n: L.entries.length }
  for (const [name, fn] of Object.entries(ops)) row[name] = timed(() => fn(L)).ms
  // The home screen asks for cash four times, dues three times and the jobs once per render.
  row.home = 4 * row['cash in hand'] + 3 * row['owed to shops'] + row['owed to him'] + row['shop stock'] + row['all jobs'] + row['days written']
  rows.push(row)
}
console.log('milliseconds on this PC (best of three):')
console.log('rows'.padStart(8) + Object.keys(ops).map((k) => k.slice(0, 11).padStart(12)).join('') + '   home screen')
for (const r of rows) console.log(String(r.n).padStart(8) + Object.keys(ops).map((k) => f(r[k]).padStart(12)).join('') + f(r.home).padStart(14))
console.log()

/* The time must grow in step with the ledger. On log–log paper "in step" is a line of slope 1 and a loop
   inside a loop is slope 2. It is judged from the smallest size that can be timed to the largest, because
   the engine's garbage collector makes any single step jumpy. */
const slope = (xs, ys) => {
  const i = ys.findIndex((y) => y >= 2)                      // quicker than 2 ms is noise
  if (i < 0 || i === ys.length - 1) return 0
  return Math.log(ys[ys.length - 1] / ys[i]) / Math.log(xs[xs.length - 1] / xs[i])
}
for (const name of [...Object.keys(ops), 'home']) {
  const s = slope(rows.map((r) => r.n), rows.map((r) => r[name]))
  ck(`${name}: time grows in step with the ledger (slope ${s.toFixed(2)}; 1 is in step, 2 is a loop inside a loop; limit 1.5)`, s <= 1.5)
}

/* ---------- the phone's brief: the whole ledger into SQLite, then summarised ---------- */

console.log()
const briefRows = []
for (const { L } of ledgers) {
  const t0 = performance.now()
  const raw = [...L.masters.map(model.rowForMaster), ...L.entries.map(model.rowForEntry)]
  const tRows = performance.now() - t0
  const t1 = performance.now()
  const led = openLedger(SQL, schemaSql, raw)
  const tLoad = performance.now() - t1
  const t2 = performance.now()
  const sum = await buildSummary(led.db, 'phone')
  const tSum = performance.now() - t2
  led.close()
  briefRows.push({ n: L.entries.length, rows: tRows, load: tLoad, sum: tSum, skipped: led.skipped, ok: sum.business.dues_total >= 0 })
}
console.log('the phone\'s brief, milliseconds:  rows  build-rows  load-to-SQLite  summarise')
for (const b of briefRows) console.log(`${String(b.n).padStart(30)}${f(b.rows).padStart(12)}${f(b.load).padStart(16)}${f(b.sum).padStart(11)}`)
{
  const s = slope(briefRows.map((b) => b.n), briefRows.map((b) => b.load + b.sum))
  ck(`the brief: time grows in step with the ledger (slope ${s.toFixed(2)}; limit 1.5)`, s <= 1.5)
  ck('the brief: every row of the biggest ledger loaded', briefRows.every((b) => b.skipped === 0))
}

/* ---------- outbox, restore, backup, Worker ---------- */

console.log()
{
  const big = ledgers[ledgers.length - 1].L
  const outbox = big.entries.map((e, i) => ({ id: e.id, ...model.rowForEntry(e), tries: 0, last_error: '', created_at: '', rejected: i % 9 === 0 }))
  const pick = timed(() => sync.pickBatch(outbox, 40))
  ck(`outbox of ${outbox.length} rows: the next batch of 40 takes ${pick.ms.toFixed(1)} ms`, pick.ms < 200 && pick.out.length === 40)

  const wire = big.entries.map(model.rowForEntry)
  const back = timed(() => wire.map((r) => restore.recordFromRow(r.tab, r.values)), 1)
  ck(`restore: ${wire.length} rows rebuilt in ${back.ms.toFixed(0)} ms, none lost`, back.out.every(Boolean))

  const json = timed(() => JSON.stringify({ masters: big.masters, entries: big.entries }), 1)
  console.log(`backup: ${(json.out.length / 1048576).toFixed(1)} MB of JSON for ${big.entries.length} rows, built in ${json.ms.toFixed(0)} ms`)
  ck('backup stays under 50 MB at this size', json.out.length < 50 * 1048576)

  const stock = big.entries.filter((e) => e.kind === 'stock').map((e) => ({ id: e.id, item_id: e.item_id, project_id: e.project_id || null, dir: e.dir, qty: e.qty, rate: e.rate, date: e.date, created_at: e.created_at, reverses: e.reverses || null }))
  const shelf = timed(() => shopShelf(stock))
  console.log(`the Worker's own JavaScript pass over ${stock.length} stock rows: ${shelf.ms.toFixed(1)} ms (a Workers free plan allows 10 ms of CPU per request; the paid plan allows far more)`)
  const pullBytes = JSON.stringify(wire).length
  console.log(`a full /pull of ${wire.length} rows would be ${(pullBytes / 1048576).toFixed(1)} MB`)
}

/* ---------- and it is still right ---------- */

console.log()
{
  const { L } = ledgers[ledgers.length - 1]
  const ref = reference(L)
  const raw = r2(L)
  const led = openLedger(SQL, schemaSql, raw)
  const server = await buildSummary(led.db, 'phone')
  led.close()
  const bad = disagreements(phoneOf(L, rng(11)), server, ref)
  ck(`the biggest ledger (${L.entries.length} rows): phone = server = answer key`, !bad.length, JSON.stringify(bad.slice(0, 3)))
  function r2(x) { return rng(5).shuffle([...x.masters.map(model.rowForMaster), ...x.entries.map(model.rowForEntry)]) }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
