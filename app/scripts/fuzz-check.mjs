/* The random check: thousands of ledgers nobody wrote by hand.

   audit-check.mjs holds the arithmetic to one ledger worked out on paper. This
   holds it to many — each one generated from a seed, so a failure can be
   replayed — and asks three independent things for every figure: the phone's
   code (calc.ts), the server's code (summary.js, run in SQLite exactly as the
   brief runs it), and an answer key written from the rules in whole paise
   (_ledger.mjs). They must agree.

   It also checks what must hold whatever the numbers are:
     · the order rows come back in changes nothing (IndexedDB hands them back at random),
     · a thing written and then cancelled changes nothing,
     · every row survives the trip to the server's columns and back,
     · the outbox never loses or starves a row,
     · numbers, dates and monthly bills behave across the whole calendar.

   FUZZ_N=3000 FUZZ_SEED=7 FUZZ_SIZE=80 npm run fuzz     (npm test runs a short version)
   A failing ledger is cut down to the few rows that still fail, and written to a file. */

process.env.TZ = 'Asia/Kolkata'

import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadApp, freeze, rng } from './_app.mjs'
import { genLedger, reference, HOUSE, SETTLE } from './_ledger.mjs'
import { figuresFor } from './_figures.mjs'

const N = Number(process.env.FUZZ_N || 120)
const SEED = Number(process.env.FUZZ_SEED || 20261002)
const SIZE = Number(process.env.FUZZ_SIZE || 60)

const app = await loadApp()
const { calc, model, bn, monthly, restore, sync, SQL, schemaSql } = app

freeze('2026-09-03T08:00:00Z')
const TODAY = bn.isoDate()
if (TODAY !== '2026-09-03') throw new Error('the frozen clock is not 3 September in Kolkata: ' + TODAY)

/* ---------- reporting ---------- */

let pass = 0, fail = 0
const props = new Map()   // name -> { cases, bad: [] }
const prop = (name) => { if (!props.has(name)) props.set(name, { cases: 0, bad: [] }); return props.get(name) }
const hit = (name, ok, detail) => { const p = prop(name); p.cases++; if (!ok) p.bad.push(detail) }

const shortRows = (L) => L.entries.map((e) => `${e.kind}/${e.dir || e.presence || ''} ${e.date} ${e.amount ?? e.cash_counted ?? ''}${e.paid === false ? ' unpaid' : ''}${e.party_id ? ' ' + e.party_id : ''}${e.reverses ? ' reverses ' + e.reverses : ''}`)

const { serverOf, phoneOf, disagreements, near } = figuresFor(app)

/* Two sets of figures from the same rows in a different order must be the same figures, list and all. */
const close = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => close(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort()
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && close(a[k], b[k]))
  }
  return a === b
}
const listFigures = (E, M) => ({
  dues: calc.openDues(E).map((d) => [d.party_id, d.due_date, d.date, d.amount, d.entry_id]),
  owed: calc.openReceivables(E).map((d) => [d.party_id, d.due_date, d.date, d.amount, d.entry_id]),
  stock: calc.shopStock(E, M.filter((m) => m.kind === 'item')).map((l) => [l.item_id, l.qty, l.rate, l.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  cash: calc.cashState(E, 0, '2026-06-01'),
})

/* ---------- shrinking ---------- */

/** Drop rows (with whatever they cancel or are cancelled by) for as long as the failure survives. */
async function shrink(L, stillFails, budget = 250) {
  let cur = L, spent = 0, changed = true
  while (changed && spent < budget) {
    changed = false
    for (let i = cur.entries.length - 1; i >= 0 && spent < budget; i--) {
      const e = cur.entries[i]
      const drop = new Set([e.id])
      for (const x of cur.entries) if (x.reverses === e.id) drop.add(x.id)
      if (e.reverses) drop.add(e.reverses)
      const next = { ...cur, entries: cur.entries.filter((x) => !drop.has(x.id)) }
      spent++
      if (await stillFails(next)) { cur = next; changed = true; i = Math.min(i, cur.entries.length) }
    }
  }
  return cur
}

const dumped = new Set()
async function report(name, L, seed, bad, stillFails) {
  if (dumped.has(name)) return
  dumped.add(name)
  const small = await shrink(L, stillFails)
  const file = join(tmpdir(), `sitekhata-fuzz-${seed}-${name.replace(/\W+/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ seed, today: TODAY, ...small, pair: undefined }, null, 1))
  prop(name).bad.push({ seed, bad: bad.slice(0, 3), rows: shortRows(small).slice(0, 14), file })
}

/* ======================================================================
   0. DIRECTED CASES — the edges the random ledgers are aimed at, written out
   ====================================================================== */

{
  const m = (o) => ({ updated_at: 't', ...o })
  const base = [
    m({ id: 's1', kind: 'party', name_bn: 'দোকান', ptype: 'supplier', terms_days: 0, phone: '' }),
    m({ id: 'p1', kind: 'project', name_bn: 'কাজ', client_bn: '', ptype: HOUSE, area_sqft: 1000, budget: 100000, start_date: '2026-06-01', plan_days: 100, status: 'active' }),
    m({ id: 'i1', kind: 'item', name_bn: 'মাল', unit_bn: 'পিস', last_rate: 10, active: true }),
  ]
  const buy = (id, amount, at, o = {}) => ({ id, kind: 'stock', batch: 'b' + id, date: '2026-07-25', project_id: '', created_at: at, item_id: 'i1', dir: 'in', qty: 1, rate: amount, amount, party_id: 's1', due_date: '2026-08-01', paid: false, photo_id: '', ...o })
  const pay = (id, amount, o = {}) => ({ id, kind: 'money', batch: 'b' + id, date: '2026-08-10', project_id: '', created_at: '2026-08-10T00:00:00.000Z', head_bn: SETTLE, dir: 'paid', amount, party_id: 's1', mode: 'নগদ', note: '', personal: false, photo_id: '', ...o })
  const ledger = (entries) => ({ masters: base, entries, today: TODAY, opening: { amount: 0, date: '2026-01-01' } })
  const both = async (name, L, want) => {
    const ph = phoneOf(L, rng(1)), sv = (await serverOf(L, rng(2))).summary
    for (const [k, [getPhone, getServer, v]] of Object.entries(want)) {
      hit('directed: ' + name, near(getPhone(ph), v, 0.0051) && near(getServer(sv), v, 0.0051), { k, phone: getPhone(ph), server: getServer(sv), want: v })
    }
  }
  const dues = [(ph) => ph.dues.total, (sv) => sv.business.dues_total]

  // Two bills due the same day; the payment clears the first and leaves 30 paise on it (which counts as paid).
  // Which bill is "first" must be the one written first, on the phone and on the server, on every phone.
  await both('same due date: the bill written first is cleared first', ledger([buy('a', 965.22, '2026-07-25T01:00:00.000Z'), buy('b', 21941.2, '2026-07-25T02:00:00.000Z'), pay('c', 964.92)]), { total: [...dues, 21941.2] })
  await both('same due date: and the other way round', ledger([buy('a', 965.22, '2026-07-25T02:00:00.000Z'), buy('b', 21941.2, '2026-07-25T01:00:00.000Z'), pay('c', 964.92)]), { total: [...dues, 21941.5] })
  await both('same due date, same instant: the lower id is cleared first', ledger([buy('b', 21941.2, '2026-07-25T01:00:00.000Z'), buy('a', 965.22, '2026-07-25T01:00:00.000Z'), pay('c', 964.92)]), { total: [...dues, 21941.2] })
  // Fifty paise left counts as paid; fifty-one does not.
  await both('50 paise left counts as paid', ledger([buy('a', 21941.2, '2026-07-25T01:00:00.000Z'), pay('c', 21940.7)]), { total: [...dues, 0] })
  await both('51 paise left is still owed', ledger([buy('a', 21941.2, '2026-07-25T01:00:00.000Z'), pay('c', 21940.69)]), { total: [...dues, 0.51] })
  await both('paying 100.5 against 100 owed leaves nothing', ledger([buy('a', 100, '2026-07-25T01:00:00.000Z'), pay('c', 100.5)]), { total: [...dues, 0] })

  // A settlement is never a job cost — even if one were ever written with a job on it.
  await both('a settlement carrying a job is not the cost of that job', ledger([pay('c', 999, { project_id: 'p1' })]), {
    other: [(ph) => ph.projects.p1.other, (sv) => sv.projects[0].other, 0],
    cost: [(ph) => ph.projects.p1.cost, (sv) => sv.projects[0].cost, 0],
  })

  // A row and its cancellation leave nothing — 0.1 + 0.2 + 0.3 − 0.1 − 0.2 − 0.3 is 1e-16 in floating point, which used to read as a job in the red.
  const slip = { id: 'e1', kind: 'money', batch: 'b1', date: '2026-08-01', project_id: 'p1', created_at: '2026-08-01T00:00:00.000Z', head_bn: 'চা-জলখাবার', dir: 'paid', amount: 0.1, party_id: '', mode: 'নগদ', note: '', personal: false, photo_id: '' }
  const slip2 = { ...slip, id: 'e2', batch: 'b2', amount: 0.2 }
  const slip3 = { ...slip, id: 'e3', batch: 'b3', amount: 0.3 }
  const wipe = ledger([slip, slip2, slip3, ...[slip, slip2, slip3].map((e, k) => ({ ...e, id: 'm' + k, amount: -e.amount, reverses: e.id, note: 'সংশোধন' }))])
  await both('everything cancelled: the job has cost nothing', wipe, {
    cost: [(ph) => ph.projects.p1.cost, (sv) => sv.projects[0].cost, 0],
  })
  // In the order written, and in the opposite order — the residue depends on the order the rows are added in.
  for (const [how, rows] of [['written order', wipe.entries], ['reversed', [...wipe.entries].reverse()]]) {
    const t0 = calc.projectTotals(base[1], rows, [])
    hit('directed: everything cancelled: no cost-per-work to speak of, and not red (' + how + ')', t0.cost === 0 && t0.cpi === null && t0.status === 'ok', { cost: t0.cost, cpi: t0.cpi, status: t0.status })
  }
  const sv0 = (await serverOf(wipe, rng(2))).summary.projects[0]
  hit('directed: everything cancelled: the server says null too, and not red', sv0.cost === 0 && sv0.cpi === null && sv0.flag_bn === 'ঠিক আছে', { cost: sv0.cost, cpi: sv0.cpi, flag: sv0.flag_bn })

  // Two counts in the same instant: the same one stands on the phone and on the server.
  const day = (id, counted) => ({ id, kind: 'day', batch: 'b' + id, date: '2026-08-20', project_id: '', created_at: '2026-08-20T00:00:00.000Z', cash_counted: counted, cash_computed: counted, note: '' })
  const tie = ledger([day('d1', 100), day('d9', 900), day('d5', 500)])
  hit('directed: two cash counts in one instant: the highest id stands, phone and server', phoneOf(tie, rng(1)).cash.anchor_amount === 900 && (await serverOf(tie, rng(2))).summary.business.cash_counted === 900, {})
}

/* ======================================================================
   1. THE FIGURES — phone, server and answer key, on random ledgers
   ====================================================================== */

let loadedAll = 0, skippedAll = 0
for (let i = 0; i < N; i++) {
  const seed = SEED + i
  const r = rng(seed)
  const L = genLedger(app, r, r.int(3, SIZE), { today: TODAY })
  const ref = reference(L)

  const shuffle = () => rng(seed ^ 0x9e3779b1)
  const evaluate = async (ledger) => {
    const sv = await serverOf(ledger, shuffle())
    return { phone: phoneOf(ledger, shuffle()), server: sv.summary, sv }
  }

  const got = await evaluate(L)
  loadedAll += got.sv.loaded; skippedAll += got.sv.skipped
  hit('every generated row loads into the server\'s columns', got.sv.skipped === 0, { seed, skipped: got.sv.skipped })

  // finite, and in range, whatever the ledger
  const finite = (v) => (typeof v === 'number' ? Number.isFinite(v) : true)
  const sane = Object.values(got.phone.dues).every((v) => typeof v !== 'number' || (Number.isFinite(v) && v >= 0))
    && got.phone.dues.overdue + got.phone.dues.thisWeek <= got.phone.dues.total + 1e-6
    && Object.values(got.phone.projects).every((p) => Object.values(p).every(finite) && p.pct_done >= 0 && p.pct_done <= 100)
    && got.phone.stock.every((l) => Number.isFinite(l.qty) && Number.isFinite(l.value))
  hit('phone figures are finite and in range', sane, { seed })

  const bad = disagreements(got.phone, got.server, ref)
  hit('phone = server = answer key', !bad.length, { seed, bad })
  if (bad.length) {
    const first = bad[0].field
    await report('phone = server = answer key', L, seed, bad, async (c) => {
      const g = await evaluate(c)
      return disagreements(g.phone, g.server, reference(c)).some((b) => b.field === first)
    })
  }

  // The same rows in another order: same figures, same lists.
  const a = listFigures(rng(seed + 1).shuffle(L.entries), rng(seed + 2).shuffle(L.masters))
  const b = listFigures(rng(seed + 3).shuffle(L.entries), rng(seed + 4).shuffle(L.masters))
  const ordered = close(a, b)
  hit('row order changes nothing (lists included)', ordered, { seed })
  if (!ordered) {
    await report('row order changes nothing (lists included)', L, seed, [{ field: 'list', got: JSON.stringify(a.dues).slice(0, 200), want: JSON.stringify(b.dues).slice(0, 200) }], async (c) =>
      !close(listFigures(rng(seed + 1).shuffle(c.entries), rng(seed + 2).shuffle(c.masters)), listFigures(rng(seed + 3).shuffle(c.entries), rng(seed + 4).shuffle(c.masters))))
  }

  // Things written and then cancelled change nothing — on the phone or on the server.
  const withPairs = { ...L, entries: [...L.entries] }
  for (let k = r.int(1, 4); k--;) withPairs.entries.push(...L.pair())
  const refPairs = reference(withPairs)
  hit('the answer key itself ignores cancelled pairs', close(JSON.parse(JSON.stringify({ ...ref, stockQty: 0 })), JSON.parse(JSON.stringify({ ...refPairs, stockQty: 0 }))), { seed })
  const gp = await evaluate(withPairs)
  const badPairs = disagreements(gp.phone, gp.server, ref)
  hit('a thing written and cancelled changes nothing', !badPairs.length, { seed, bad: badPairs })
  if (badPairs.length) {
    const first = badPairs[0].field
    await report('a thing written and cancelled changes nothing', withPairs, seed, badPairs, async (c) => {
      const g = await evaluate(c)
      // the shrunk ledger must keep its own cancelled pairs; compare against the key of the same rows
      return disagreements(g.phone, g.server, reference(c)).some((x) => x.field === first)
    })
  }

  // Rows go up in the outbox format and come back in the app's own shape: sending what came back
  // must produce exactly the row that was sent, cell for cell.
  let trips = true, why = ''
  const again = (orig, up, rowOf) => {
    const row = rowOf(orig)
    const back = restore.recordFromRow(row.tab, row.values)
    if (!back) { trips = false; why ||= `${row.tab} ${orig.id} did not come back`; return }
    const row2 = rowOf(back.rec)
    row.values.forEach((v, k) => {
      const w = row2.values[k]
      const same = typeof v === 'number' && typeof w === 'number' ? Math.abs(v - w) < 1e-9 : v === w || (v === '' && w === false)   // a flag never set is a flag that is off
      if (!same) { trips = false; why ||= `${row.tab}.${model.SHEET_COLUMNS[row.tab][k]}: sent ${JSON.stringify(v)}, came back ${JSON.stringify(w)}` }
    })
  }
  for (const e of L.entries.slice(0, 60)) again(e, true, model.rowForEntry)
  for (const m of L.masters) again(m, true, model.rowForMaster)
  hit('every row comes back from the server as it went up', trips, { seed, why })
}

/* ======================================================================
   2. THE OUTBOX — pickBatch never loses, repeats or starves a row
   ====================================================================== */

for (let i = 0; i < Math.max(60, N); i++) {
  const r = rng(SEED + 7000 + i)
  const size = r.int(1, 12)
  let box = Array.from({ length: r.int(0, 80) }, (_, k) => ({ id: 'r' + k, tab: 'Money', mode: 'append', values: [], tries: 0, last_error: '', created_at: '', rejected: r.chance(0.4) }))
  const fresh = box.filter((x) => !x.rejected).map((x) => x.id)

  const pick = sync.pickBatch(box, size)
  const ids = pick.map((x) => x.id)
  const freshFirst = fresh.slice(0, size)
  hit('pickBatch: never more than a batch', pick.length <= size, { i })
  hit('pickBatch: no row twice', new Set(ids).size === ids.length, { i })
  hit('pickBatch: fresh rows go first, in the order they were written', freshFirst.every((x, k) => ids[k] === x), { i, ids, freshFirst })
  hit('pickBatch: a full batch is sent whenever that many are waiting', pick.length === Math.min(size, box.length), { i })

  // Run it to the end, with the server refusing the rows it dislikes: every fresh row must be sent exactly once.
  const sent = []
  let safety = 400
  while (box.some((x) => !x.rejected) && safety--) {
    const batch = sync.pickBatch(box, size)
    for (const row of batch) {
      if (row.id.endsWith('7')) box = box.map((x) => (x.id === row.id ? { ...x, rejected: true } : x))
      else { sent.push(row.id); box = box.filter((x) => x.id !== row.id) }
    }
  }
  hit('pickBatch: draining sends every row it can, once', safety > 0 && new Set(sent).size === sent.length, { i })
}

/* ======================================================================
   3. NUMBERS AND DATES — the whole calendar, any garbage
   ====================================================================== */

const rn = rng(SEED + 9000)
const asBn = (s) => s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[+d])
const utcIso = (ms) => new Date(ms).toISOString().slice(0, 10)

for (let i = 0; i < Math.max(600, N * 6); i++) {
  // Indian grouping against the platform's own en-IN formatter.
  const whole = rn.chance(0.5) ? rn.int(-99999999, 99999999) : rn.int(0, 999)
  hit('groupIndian matches the en-IN formatter for whole rupees', bn.groupIndian(whole) === new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(whole), { whole, got: bn.groupIndian(whole), want: new Intl.NumberFormat('en-IN').format(whole) })
  const paise2 = rn.money(0, 9999999)
  hit('groupIndian with paise reads back as the same number', Math.abs((bn.parseNum(bn.groupIndian(paise2)) ?? NaN) - paise2) < 1e-9, { paise2, got: bn.groupIndian(paise2) })
  hit('typed Bengali digits are the same number', bn.parseNum(asBn(String(whole))) === whole, { whole })
  hit('toAscii undoes the Bengali digits', bn.toAscii(asBn(String(Math.abs(whole)))) === String(Math.abs(whole)), { whole })
  const junk = Array.from({ length: rn.int(0, 12) }, () => rn.pick(['1', '২', '.', ',', '-', ' ', '₹', 'a', '٣', '१', 'e', '+', '/', '০'])).join('')
  let threw = false, v
  try { v = bn.parseNum(junk) } catch { threw = true }
  hit('parseNum never throws and never returns NaN', !threw && (v === null || Number.isFinite(v)), { junk, v })

  // Dates against UTC arithmetic over 1990–2100.
  const day = rn.int(Date.UTC(1990, 0, 1) / 86400000, Date.UTC(2100, 11, 31) / 86400000)
  const iso = utcIso(day * 86400000), k = rn.int(-800, 800)
  hit('addDays agrees with calendar arithmetic', bn.addDays(iso, k) === utcIso((day + k) * 86400000), { iso, k, got: bn.addDays(iso, k) })
  hit('daysBetween is the inverse of addDays', bn.daysBetween(iso, bn.addDays(iso, k)) === k, { iso, k })
  hit('isoDate(fromIso(x)) = x', bn.isoDate(bn.fromIso(iso)) === iso, { iso })

  // A monthly bill: lands on the day he means, never goes backwards, never skips a month.
  const anchor = rn.int(1, 31)
  const y = rn.int(2024, 2032), m = rn.int(1, 12)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const due = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(anchor, lastDay)).padStart(2, '0')}`
  const repeat = anchor > 28 || rn.chance(0.3) ? (anchor === Number(due.slice(8)) && !rn.chance(0.5) ? 'monthly' : `monthly@${anchor}`) : 'monthly'
  const next = monthly.nextDue(due, repeat)
  const [ny, nm, nd] = next.due_date.split('-').map(Number)
  const wantMonth = m === 12 ? 1 : m + 1
  const nLast = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  const meant = monthly.monthlyAnchor(due, repeat)
  hit('a monthly bill comes round once a month', nm === wantMonth && ny === (m === 12 ? y + 1 : y), { due, repeat, next: next.due_date })
  hit('a monthly bill lands on the day he means, or the last day of a short month', nd === Math.min(meant, nLast), { due, repeat, next: next.due_date, meant })
  hit('and the day he means is not forgotten', monthly.monthlyAnchor(next.due_date, next.repeat) === meant, { due, repeat, next })
  let again = { due_date: due, repeat }
  for (let s = 0; s < 14; s++) again = monthly.nextDue(again.due_date, again.repeat)
  hit('fourteen months on it is still the same day', Number(again.due_date.slice(8)) === Math.min(meant, new Date(Date.UTC(Number(again.due_date.slice(0, 4)), Number(again.due_date.slice(5, 7)), 0)).getUTCDate()), { due, repeat, again })
}

/* ---------- the verdict ---------- */

console.log(`rows loaded into the server's columns: ${loadedAll}, refused: ${skippedAll}   (seed ${SEED}, ${N} ledgers of up to ${SIZE} events)`)
for (const [name, p] of props) {
  const bad = p.bad
  if (!bad.length) { pass++; console.log(`ok   ${name}  (${p.cases})`); continue }
  fail++
  console.log(`FAIL ${name}  (${bad.length} of ${p.cases})`)
  for (const b of bad.slice(0, 3)) console.log('     ' + JSON.stringify(b).slice(0, 900))
}
console.log(`\n${pass} properties held, ${fail} did not`)
process.exit(fail ? 1 : 0)
