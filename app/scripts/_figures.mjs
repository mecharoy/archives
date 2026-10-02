/* Phone, server and answer key side by side — shared by the fuzz and large-ledger checks. */

import { openLedger } from '../nightly/ledger-sql.mjs'
import { buildSummary } from '../server/src/summary.js'
import { projectStatus } from '../nightly/compute.mjs'

export function figuresFor(app) {
  const { calc, model, SQL, schemaSql } = app

  /* ---------- the three answers ---------- */

  async function serverOf(L, r) {
    const rows = r.shuffle([...L.masters.map(model.rowForMaster), ...L.entries.map(model.rowForEntry)])
    const led = openLedger(SQL, schemaSql, rows)
    try {
      const summary = await buildSummary(led.db, 'phone')
      return { summary, loaded: led.loaded, skipped: led.skipped, total: rows.length }
    } finally { led.close() }
  }

  function phoneOf(L, r) {
    const E = r.shuffle(L.entries), M = r.shuffle(L.masters)
    const items = M.filter((m) => m.kind === 'item'), stages = M.filter((m) => m.kind === 'stage')
    const levels = calc.shopStock(E, items)
    const out = {
      dues: calc.duesSplit(E), owed: calc.receivablesSplit(E),
      stock: levels, stockValue: levels.reduce((a, l) => a + l.value, 0),
      cash: calc.cashState(E, L.opening.amount, L.opening.date),
      last3: calc.entriesInLastDays(E, 3), lastDate: calc.lastEntryDate(E),
      projects: {},
    }
    for (const p of M.filter((m) => m.kind === 'project')) out.projects[p.id] = calc.projectTotals(p, E, stages)
    return out
  }

  /* ---------- comparing ---------- */

  const near = (got, want, tol) => (want === null || got === null || got === undefined ? got === want : Number.isFinite(got) && Math.abs(got - want) <= tol)
  const exact = (want) => 1e-6 * Math.max(1, Math.abs(want ?? 0))      // the phone does not round
  const paise = 0.0051                                                  // the server rounds to two places

  /** Every disagreement between the phone, the server and the answer key, as { field, got, want }. */
  function disagreements(phone, server, ref) {
    const bad = []
    const chk = (field, got, want, tol) => { if (!near(got, want, tol)) bad.push({ field, got, want }) }
    const phoneVs = (f, got, want) => chk('phone ' + f, got, want, typeof want === 'number' ? exact(want) : 0)
    const serverVs = (f, got, want, tol = paise) => chk('server ' + f, got, want, tol)

    for (const k of ['total', 'overdue', 'thisWeek']) {
      phoneVs('dues.' + k, phone.dues[k], ref.dues[k])
      phoneVs('owed.' + k, phone.owed[k], ref.owed[k])
    }
    phoneVs('shop stock value', phone.stockValue, ref.stockValue)
    phoneVs('cash in hand', phone.cash.computed, ref.cash.computed)
    phoneVs('cash anchor amount', phone.cash.anchor_amount, ref.cash.anchor_amount)
    chk('phone cash anchor date', phone.cash.anchor_date === ref.cash.anchor_date ? 1 : 0, 1, 0)
    phoneVs('days written, last 3', phone.last3, ref.last3)
    if (phone.lastDate !== ref.lastDate) bad.push({ field: 'phone last entry date', got: phone.lastDate, want: ref.lastDate })

    const b = server.business
    serverVs('dues_total', b.dues_total, ref.dues.total)
    serverVs('dues_overdue', b.dues_overdue, ref.dues.overdue)
    serverVs('dues_this_week', b.dues_this_week, ref.dues.thisWeek)
    serverVs('receivable_total', b.receivable_total, ref.owed.total)
    serverVs('receivable_overdue', b.receivable_overdue, ref.owed.overdue)
    serverVs('receivable_this_week', b.receivable_this_week, ref.owed.thisWeek)
    serverVs('shop_stock_value', b.shop_stock_value, ref.stockValue)
    serverVs('cash_counted', b.cash_counted, ref.cash.counted)
    if ((b.cash_counted_on || null) !== ref.cash.counted_on) bad.push({ field: 'server cash_counted_on', got: b.cash_counted_on, want: ref.cash.counted_on })
    serverVs('entries_last_3_days', b.entries_last_3_days, ref.last3, 0)
    if ((b.last_entry_date || null) !== ref.lastDate) bad.push({ field: 'server last_entry_date', got: b.last_entry_date, want: ref.lastDate })

    for (const [id, want] of Object.entries(ref.projects)) {
      const mine = phone.projects[id]
      for (const k of ['labour', 'material', 'other', 'received', 'cost', 'pct_done', 'pct_spent']) phoneVs(`job ${k}`, mine[k], want[k])
      phoneVs('job cpi', mine.cpi, want.cpi)
      const sp = server.projects.find((p) => p.id === id)
      if (!sp) { bad.push({ field: 'server job present', got: 'missing', want: id }); continue }
      for (const k of ['labour', 'material', 'other', 'received', 'cost', 'pct_done', 'pct_spent']) serverVs(`job ${k}`, sp[k], want[k])
      serverVs('job cpi', sp.cpi, want.cpi, 0.00051)

      // The two halves must paint a job the same colour — unless it sits on a boundary the rounding can tip.
      const gap = sp.pct_spent - sp.pct_done
      const edge = [15, 6].some((x) => Math.abs(gap - x) < 0.03) || [0.9, 1].some((x) => sp.cpi != null && Math.abs(sp.cpi - x) < 0.002)
      const budget = sp.budget
      if (!edge && budget > 0) {
        const want = projectStatus(sp)
        if (mine.status !== want) bad.push({ field: 'job colour (phone vs server)', got: mine.status, want })
      }
    }
    return bad
  }


  return { serverOf, phoneOf, disagreements, near }
}
