/* Random ledgers, and an independent answer key for them.

   genLedger builds a ledger the way the app does — through the wizard's own
   row builder (draft.buildEntries), the shop's stock rows, the payment screen's
   settlements and reversalOf for every correction — with the awkward things a
   real year contains: two rows written in the same instant, rows dated in the
   future, a payment bigger than the bill, a bill left 40 paise short, a count
   that was later cancelled.

   reference() works the same figures out from the rules as they are written in
   the comments, as plain loops over WHOLE PAISE. It does not call calc.ts or
   summary.js, so when all three agree it is not because two of them share a
   bug. */

import { RealDate } from './_app.mjs'

export const HOUSE = 'বাড়ি'
export const SETTLE = 'বাকি মেটানো'
export const DRAWING = 'ব্যবসা থেকে নেওয়া'
const CASH = 'নগদ'

const round2 = (x) => Math.round(x * 100) / 100

export function genLedger(app, r, nEvents, o = {}) {
  const { draft, bn, model } = app
  const today = o.today
  const d = (k) => bn.addDays(today, -k)            // k days ago; negative is the future
  const past = () => d(r.int(-2, o.horizon ?? 70))

  let tick = 0, last = null
  const base = RealDate.parse('2026-08-01T00:00:00Z')
  const stamp = () => {
    if (last && r.chance(o.ties ?? 0.12)) return last   // two things written in the same instant
    last = new RealDate(base + (++tick) * 1000).toISOString()
    return last
  }
  const used = new Set()
  const nid = (p) => { let x; do x = p + r.hex(10); while (used.has(x)); used.add(x); return x }

  /* ---------- who and what ---------- */
  const masters = []
  const projects = Array.from({ length: r.int(1, o.projects ?? 3) }, (_, i) => {
    const m = r.f()
    return {
      id: 'p' + i, kind: 'project', name_bn: 'কাজ ' + i, client_bn: '', ptype: r.chance(0.88) ? HOUSE : 'নেই',
      area_sqft: r.chance(0.2) ? null : r.int(400, 3000),
      budget: m < 0.1 ? 0 : m < 0.2 ? null : r.int(1, 60) * 100000,
      start_date: d(r.int(10, 90)), plan_days: r.chance(0.2) ? null : r.int(60, 300),
      status: r.chance(0.8) ? 'active' : 'done', updated_at: stamp(),
    }
  })
  const workers = Array.from({ length: r.int(2, 5) }, (_, i) => ({ id: 'w' + i, kind: 'worker', name_bn: 'কর্মী ' + i, rate: r.int(300, 900), phone: '', active: r.chance(0.9), updated_at: stamp() }))
  const items = Array.from({ length: r.int(3, o.items ?? 7) }, (_, i) => ({ id: 'i' + i, kind: 'item', name_bn: 'মাল ' + i, unit_bn: 'পিস', last_rate: r.chance(0.3) ? null : r.money(10, 500), active: true, updated_at: stamp() }))
  const suppliers = Array.from({ length: r.int(1, o.parties ?? 4) }, (_, i) => ({ id: 's' + i, kind: 'party', name_bn: 'দোকান ' + i, ptype: 'supplier', terms_days: 15, phone: '', updated_at: stamp() }))
  const clients = Array.from({ length: r.int(0, 3) }, (_, i) => ({ id: 'c' + i, kind: 'party', name_bn: 'খদ্দের ' + i, ptype: 'client', terms_days: 7, phone: '', updated_at: stamp() }))
  const weights = r.chance(0.1) ? [] : r.pick([[20, 30, 25, 25], [10, 10, 10, 10], [0, 0, 0, 0], [50, 0, 25, 25], [33.33, 33.33, 33.34, 0]])
  const stages = weights.map((w, i) => ({ id: 'st' + i, kind: 'stage', project_type: HOUSE, seq: i + 1, name_bn: 'ধাপ ' + (i + 1), weight: w, updated_at: stamp() }))
  const coeffs = items.filter(() => r.chance(0.5)).map((it, i) => ({ id: 'co' + i, kind: 'coeff', project_type: HOUSE, item_id: it.id, per_sqft: r.money(0.05, 5), updated_at: stamp() }))
  masters.push(...projects, ...workers, ...items, ...suppliers, ...clients, ...stages, ...coeffs)

  /* ---------- rows ---------- */
  const entries = []
  const unpaid = new Map()   // party -> amounts left unpaid, so a payment can be aimed at them
  const owe = (party, amount) => { if (party) unpaid.set(party, [...(unpaid.get(party) || []), amount]) }

  const stockRow = (x) => ({
    id: nid('e'), kind: 'stock', batch: nid('b'), project_id: '', party_id: '', due_date: '', paid: true, photo_id: '',
    created_at: stamp(), amount: round2((x.qty || 0) * (x.rate || 0)), ...x,
  })
  const moneyRow = (x) => ({
    id: nid('e'), kind: 'money', batch: nid('b'), project_id: '', party_id: '', mode: CASH, note: '', personal: false, photo_id: '',
    created_at: stamp(), ...x,
  })

  const qtyOf = () => (r.chance(0.5) ? r.int(1, 120) : r.money(0.25, 60))
  const dueFor = (paid) => (paid ? '' : r.chance(0.85) ? d(r.int(-20, 40)) : '')
  const supplierId = () => r.pick(suppliers).id
  const clientId = () => (clients.length ? r.pick(clients).id : '')

  function dayRows() {
    const date = past()
    const proj = r.chance(0.12) ? '' : r.pick(projects).id
    const dr = draft.newDraft(date, proj)
    dr.batch = nid('b')
    for (const w of workers) if (r.chance(0.5)) {
      const presence = r.pick(['full', 'half', 'ot'])
      dr.att[w.id] = {
        presence, rate: w.rate,
        amount: r.chance(0.85) ? round2(draft.DAYS_FOR[presence] * w.rate) : r.money(0, 1500),
        advance: r.chance(0.25) ? r.money(0, 400) : 0,
      }
    }
    const mat = (shop) => {
      const paid = r.chance(0.5)
      const party_id = !paid || r.chance(0.5) ? supplierId() : ''
      const m = { key: nid('k'), item_id: r.pick(items).id, qty: qtyOf(), rate: r.money(1, 900), party_id, due_date: dueFor(paid), paid, photo_id: '' }
      if (!paid) owe(party_id, round2(m.qty * m.rate))
      return m
    }
    for (let k = r.int(0, 3); k--;) dr.mats.push(mat())
    for (let k = r.int(0, 2); k--;) dr.invs.push(mat())
    if (r.chance(0.2)) dr.rets.push({ key: nid('k'), item_id: r.pick(items).id, qty: r.int(1, 20), rate: r.money(1, 900) })
    for (let k = r.int(0, 2); k--;) dr.exps.push({ key: nid('k'), head_bn: r.pick(model.MONEY_HEADS_SITE), amount: r.money(10, 5000), mode: r.chance(0.7) ? CASH : r.pick(model.PAY_MODES), note: '', photo_id: '' })
    if (r.chance(0.2)) dr.pexps.push({ key: nid('k'), head_bn: r.pick(model.MONEY_HEADS_PERSONAL), amount: r.money(10, 2000), mode: CASH, note: '', photo_id: '' })
    if (r.chance(0.25)) dr.progress = { stage_seq: r.int(1, 5), state: r.pick(['half', 'done']) }
    if (r.chance(0.25)) { dr.cash_counted = r.chance(0.1) ? 0 : r.money(0, 120000); dr.cash_computed = r.money(0, 120000) }
    const rows = draft.buildEntries(dr)
    const at = stamp()                                   // a whole day is saved in one instant
    for (const e of rows) { e.id = nid('e'); e.created_at = at }
    return rows
  }

  function shopRows() {
    const dir = r.pick(['in', 'in', 'sale', 'sale', 'transfer', 'count'])
    const x = { date: past(), item_id: r.pick(items).id, dir, qty: qtyOf(), rate: r.chance(0.05) ? 0 : r.money(1, 900) }
    if (dir === 'in') {
      x.paid = r.chance(0.5)
      x.party_id = !x.paid || r.chance(0.5) ? supplierId() : ''
      x.due_date = dueFor(x.paid)
    } else if (dir === 'sale') {
      x.paid = r.chance(0.6)
      x.party_id = !x.paid || r.chance(0.2) ? clientId() : ''
      x.due_date = dueFor(x.paid)
    } else if (dir === 'transfer') {
      x.project_id = r.pick(projects).id
    } else {
      x.qty = r.chance(0.2) ? 0 : r.int(0, 150)
    }
    const row = stockRow(x)
    if (!row.paid) owe(row.party_id, row.amount)
    return [row]
  }

  function settleRows() {
    const fromSupplier = r.chance(0.65) || !clients.length
    const party_id = fromSupplier ? supplierId() : clientId()
    const known = unpaid.get(party_id) || []
    let amount
    if (known.length && r.chance(0.5)) {
      // Aim at the edge: clear some bills and leave a sliver, or none at all.
      const sum = known.slice(0, r.int(1, known.length)).reduce((a, x) => a + x, 0)
      amount = Math.max(0.01, round2(sum - r.pick([0, 0.3, 0.5, 0.51, 0.49, 1, 2])))
    } else amount = r.money(1, 30000)
    return [moneyRow({ date: past(), head_bn: SETTLE, dir: fromSupplier ? 'paid' : 'received', amount, party_id, mode: r.chance(0.7) ? CASH : r.pick(model.PAY_MODES) })]
  }

  function moneyRows() {
    if (r.chance(0.4)) {
      const drawing = r.chance(0.4)
      return [moneyRow({ date: past(), head_bn: drawing ? DRAWING : r.pick(model.MONEY_HEADS_PERSONAL), dir: 'paid', amount: r.money(10, 20000), personal: true, mode: r.chance(0.8) ? CASH : 'UPI' })]
    }
    return [moneyRow({
      date: past(), project_id: r.chance(0.8) ? r.pick(projects).id : '', head_bn: r.pick(model.MONEY_HEADS_SITE),
      dir: r.chance(0.8) ? 'paid' : 'received', amount: r.money(10, 20000), mode: r.chance(0.7) ? CASH : r.pick(model.PAY_MODES),
    })]
  }

  const reversed = new Set()
  function reverseRows() {
    const pool = entries.filter((e) => !e.reverses && !reversed.has(e.id))
    if (!pool.length) return []
    const e = r.pick(pool)
    const targets = r.chance(0.3) ? pool.filter((x) => x.batch === e.batch) : [e]
    const at = stamp()
    return targets.map((t) => { reversed.add(t.id); const m = draft.reversalOf(t); m.id = nid('e'); m.created_at = at; return m })
  }

  const weightsOfKinds = [['day', 0.3], ['shop', 0.3], ['settle', 0.12], ['money', 0.1], ['reverse', 0.1]]
  for (let n = 0; n < nEvents; n++) {
    let x = r.f(), kind = 'day'
    for (const [k, w] of weightsOfKinds) { if (x < w) { kind = k; break } x -= w }
    const rows = kind === 'day' ? dayRows() : kind === 'shop' ? shopRows() : kind === 'settle' ? settleRows() : kind === 'money' ? moneyRows() : reverseRows()
    entries.push(...rows)
  }

  return {
    masters, entries, today,
    opening: { amount: r.chance(0.5) ? 0 : r.money(0, 5000), date: d(r.int(0, 80)) },
    /** A fresh event and its cancellation — which must change nothing. */
    pair: () => {
      const rows = [dayRows, shopRows, settleRows, moneyRows][r.int(0, 3)]()
      const at = stamp()
      const mirrors = rows.map((t) => { const m = draft.reversalOf(t); m.id = nid('e'); m.created_at = at; return m })
      return [...rows, ...mirrors]
    },
  }
}

/* ======================================================================
   THE ANSWER KEY — whole paise, written from the rules, not from calc.ts.
   ====================================================================== */

const P = (x) => Math.round((x || 0) * 100)
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const written = (a, b) => cmp(a.date, b.date) || cmp(a.created_at, b.created_at) || cmp(a.id, b.id)
const shiftDay = (iso, k) => {
  const [y, m, dd] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd) + k * 86400000).toISOString().slice(0, 10)
}

export function reference(L) {
  const { today } = L
  const E = L.entries
  const cancelled = new Set(E.filter((e) => e.reverses).map((e) => e.reverses))
  const live = E.filter((e) => !e.reverses && !cancelled.has(e.id))
  const week = shiftDay(today, 7)

  /* What is still owed, by party: payments close the OLDEST bill first (due date, then the day it was
     written, then the instant, then id), and a bill with 50 paise or less left is treated as paid. */
  const owed = (dirs, settleDir) => {
    const by = new Map()
    for (const s of live) if (s.kind === 'stock' && dirs.includes(s.dir) && !s.paid && P(s.amount) > 0) {
      by.set(s.party_id, [...(by.get(s.party_id) || []), s])
    }
    let total = 0, overdue = 0, soon = 0
    for (const [party, rows] of by) {
      let pot = 0
      for (const m of live) if (m.kind === 'money' && !m.personal && m.head_bn === SETTLE && m.dir === settleDir && m.party_id === party) pot += P(m.amount)
      rows.sort((a, b) => cmp(a.due_date || a.date, b.due_date || b.date) || written(a, b))
      for (const s of rows) {
        let left = P(s.amount)
        const use = Math.min(pot, left)
        pot -= use; left -= use
        if (left <= 50) continue
        total += left
        const due = s.due_date || s.date
        if (due < today) overdue += left
        else if (due <= week) soon += left
      }
    }
    return { total: total / 100, overdue: overdue / 100, thisWeek: soon / 100 }
  }

  /* The shelf. */
  let stockValue = 0
  const stockQty = new Map()
  const stockRows = live.filter((e) => e.kind === 'stock').sort(written)
  for (const it of L.masters.filter((m) => m.kind === 'item')) {
    const mine = stockRows.filter((s) => s.item_id === it.id)
    const counted = mine.filter((s) => s.dir === 'count' && !s.project_id)
    const lastCount = counted[counted.length - 1]
    let qty = lastCount ? lastCount.qty : 0
    let rate = lastCount ? lastCount.rate || 0 : 0
    for (const s of mine) {
      if (s.project_id && s.dir !== 'transfer') continue
      if (lastCount && s.date <= lastCount.date) continue
      if (s.dir === 'in' && !s.project_id) { qty += s.qty; rate = s.rate || rate }
      else if (s.dir === 'sale' || s.dir === 'transfer') qty -= s.qty
    }
    if (Math.abs(qty) > 1e-9) { stockValue += qty * (rate || it.last_rate || 0); stockQty.set(it.id, qty) }
  }

  /* Cash: the last count that stands, then everything dated after it. Reversals are summed in (they
     are negative), so a cancelled payment cancels itself out. */
  const counts = live.filter((e) => e.kind === 'day' && e.cash_counted != null).sort(written)
  const anchor = counts[counts.length - 1]
  const anchorDate = anchor ? anchor.date : L.opening.date
  const anchorPaise = anchor ? P(anchor.cash_counted) : P(L.opening.amount)
  let inc = 0, out = 0
  for (const e of E) {
    if (e.date <= anchorDate) continue
    if (e.kind === 'attendance') out += P(e.amount) + P(e.advance)
    else if (e.kind === 'stock') {
      if (e.dir === 'in' && e.paid) out += P(e.amount)
      if (e.dir === 'sale' && e.paid) inc += P(e.amount)
    } else if (e.kind === 'money') {
      if (e.personal) { if (e.head_bn === DRAWING) out += P(e.amount) }
      else if (e.mode === CASH) { if (e.dir === 'received') inc += P(e.amount); else out += P(e.amount) }
    }
  }

  /* Jobs. */
  const projects = {}
  for (const p of L.masters.filter((m) => m.kind === 'project')) {
    const mine = E.filter((e) => e.project_id === p.id)
    let labour = 0, material = 0, other = 0, received = 0
    for (const e of mine) {
      if (e.kind === 'attendance') labour += P(e.amount)
      else if (e.kind === 'stock' && (e.dir === 'in' || e.dir === 'transfer')) material += P(e.amount)
      else if (e.kind === 'money' && !e.personal && e.head_bn !== SETTLE) { if (e.dir === 'paid') other += P(e.amount); else received += P(e.amount) }
    }
    const st = L.masters.filter((m) => m.kind === 'stage' && m.project_type === p.ptype).sort((a, b) => a.seq - b.seq)
    let pct = 0
    if (st.length) {
      const total = st.reduce((a, s) => a + s.weight, 0) || 100
      let done = 0
      for (const s of st) {
        const rows = live.filter((e) => e.kind === 'progress' && e.project_id === p.id && e.stage_seq === s.seq)
        if (rows.some((e) => e.state === 'done')) done += s.weight
        else if (rows.length) done += s.weight / 2
      }
      pct = Math.min(100, (done / total) * 100)
    }
    const cost = (labour + material + other) / 100
    const budget = p.budget || 0
    const earned = (pct / 100) * budget
    projects[p.id] = {
      labour: labour / 100, material: material / 100, other: other / 100, received: received / 100, cost,
      pct_done: pct, pct_spent: budget > 0 ? (cost / budget) * 100 : 0, cpi: cost > 0 && budget > 0 ? earned / cost : null,
    }
  }

  const recent = live.filter((e) => e.date >= shiftDay(today, -2))
  return {
    dues: owed(['in', 'transfer'], 'paid'),
    owed: owed(['sale'], 'received'),
    stockValue, stockQty,
    cash: {
      anchor_date: anchorDate, anchor_amount: anchorPaise / 100, computed: (anchorPaise + inc - out) / 100,
      counted: anchor ? anchorPaise / 100 : null, counted_on: anchor ? anchor.date : null,
    },
    projects,
    last3: new Set(recent.map((e) => e.batch)).size,
    lastDate: live.reduce((m, e) => (m == null || e.date > m ? e.date : m), null),
  }
}
