/* The forty-odd numbers the nightly run reads.
   These are computed here, once, from the stored rows — never sent up by the
   phone and never re-derived by a model. Reversal rows carry negative amounts,
   so the money sums net out on their own; only the stage percentage needs to
   know that a reversed row is cancelled, and that is the one thing done in
   JavaScript rather than SQL. */

const MONTH_START = "date(strftime('%Y-%m-01','now','localtime'))"

async function one(db, sql, ...args) {
  const row = await db.prepare(sql).bind(...args).first()
  return row || {}
}

async function all(db, sql, ...args) {
  const res = await db.prepare(sql).bind(...args).all()
  return res.results || []
}

/* The one head that moves cash without being a cost — settling an old bill.
   Kept identical to the app's SETTLE_HEAD; if one side ever changes it, the
   dashboard starts double-counting and the tests here say so. */
const SETTLE_HEAD = 'বাকি মেটানো'

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Payments land on the oldest bill for that party first, exactly as in the
    app's calc.ts, so both sides answer the same question the same way. */
function net(rows, settlements, dir) {
  const pot = new Map()
  for (const s of settlements) {
    if (s.dir !== dir) continue
    pot.set(s.party_id, n(pot.get(s.party_id)) + n(s.amount))
  }
  const today = new Date().toISOString().slice(0, 10)
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  let total = 0, overdue = 0, inWeek = 0
  for (const r of rows) {
    let amount = n(r.amount)
    const left = n(pot.get(r.party_id))
    if (left > 0) {
      const used = Math.min(left, amount)
      amount -= used
      pot.set(r.party_id, left - used)
    }
    if (amount <= 0.5) continue
    total += amount
    if (r.due_date && r.due_date < today) overdue += amount
    else if (r.due_date && r.due_date <= week) inWeek += amount
  }
  return { total, overdue, week: inWeek }
}
const round = (v) => Math.round(n(v) * 100) / 100

export async function buildSummary(db, hid) {
  const [projects, stages, progress, lastCount, openRows, settlements, monthly, activity, stock] = await Promise.all([
    all(db, 'SELECT id, name_bn, ptype, budget, area_sqft, start_date, plan_days, status FROM projects WHERE household_id = ?1 ORDER BY status, name_bn', hid),
    all(db, 'SELECT project_type, seq, name_bn, weight FROM stages WHERE household_id = ?1 ORDER BY project_type, seq', hid),
    all(db, 'SELECT id, project_id, stage_seq, state, reverses FROM progress WHERE household_id = ?1', hid),
    one(db, `SELECT cash_counted, cash_computed, date FROM day
             WHERE household_id = ?1 AND cash_counted IS NOT NULL
             ORDER BY date DESC, created_at DESC LIMIT 1`, hid),
    // Open bills, and the payments that close them. The netting is done in
    // JavaScript with exactly the rule the phone uses — oldest bill first —
    // so the dashboard and his screen can never disagree about what he owes.
    all(db, `SELECT party_id, amount, COALESCE(NULLIF(due_date,''), date) AS due_date, dir
             FROM stock WHERE household_id = ?1 AND paid = 0 AND dir IN ('in','transfer','sale')
             ORDER BY due_date`, hid),
    all(db, `SELECT party_id, dir, COALESCE(SUM(amount),0) AS amount
             FROM money WHERE household_id = ?1 AND personal = 0 AND head_bn = ?2
             GROUP BY party_id, dir`, hid, SETTLE_HEAD),
    one(db, `SELECT
               (SELECT COALESCE(SUM(amount),0) FROM attendance
                 WHERE household_id = ?1 AND date >= ${MONTH_START}) AS wages,
               (SELECT COALESCE(SUM(amount),0) FROM stock
                 WHERE household_id = ?1 AND date >= ${MONTH_START} AND dir IN ('in','transfer')) AS material,
               (SELECT COALESCE(SUM(amount),0) FROM money
                 WHERE household_id = ?1 AND date >= ${MONTH_START} AND dir = 'paid' AND personal = 0
                   AND head_bn <> '${SETTLE_HEAD}') AS other,
               (SELECT COALESCE(SUM(amount),0) FROM money
                 WHERE household_id = ?1 AND date >= ${MONTH_START} AND dir = 'received' AND personal = 0) AS received,
               (SELECT COALESCE(SUM(amount),0) FROM money
                 WHERE household_id = ?1 AND date >= ${MONTH_START} AND personal = 1
                   AND head_bn = 'ব্যবসা থেকে নেওয়া') AS drawings`, hid),
    one(db, `SELECT
               (SELECT COUNT(*) FROM day WHERE household_id = ?1
                 AND date >= date('now','localtime','-2 day')) AS last3,
               (SELECT MAX(date) FROM day WHERE household_id = ?1) AS last_date,
               (SELECT COUNT(*) FROM projects WHERE household_id = ?1 AND status = 'active') AS active,
               (SELECT COUNT(*) FROM workers WHERE household_id = ?1 AND active = 1) AS men`, hid),
    one(db, `SELECT
               COALESCE(SUM(CASE WHEN project_id = '' AND dir = 'in' THEN amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN dir IN ('sale','transfer') THEN amount ELSE 0 END), 0) AS value
             FROM stock WHERE household_id = ?1`, hid),
  ])

  const perProject = []
  for (const p of projects) {
    const t = await one(db, `SELECT
        (SELECT COALESCE(SUM(amount),0) FROM attendance WHERE household_id = ?1 AND project_id = ?2) AS labour,
        (SELECT COALESCE(SUM(amount),0) FROM stock WHERE household_id = ?1 AND project_id = ?2 AND dir IN ('in','transfer')) AS material,
        (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'paid' AND personal = 0) AS other,
        (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'received' AND personal = 0) AS received`,
      hid, p.id)

    const cost = n(t.labour) + n(t.material) + n(t.other)
    const budget = n(p.budget)
    const pct_done = stagePercent(p, stages, progress)
    const pct_spent = budget > 0 ? (cost / budget) * 100 : 0
    const earned = (pct_done / 100) * budget
    const cpi = cost > 0 && budget > 0 ? earned / cost : null
    const at_finish = pct_done > 2 ? cost / (pct_done / 100) : null
    const gap = pct_spent - pct_done

    perProject.push({
      id: p.id,
      name_bn: p.name_bn,
      status: p.status,
      // The planned line is drawn from these two and nothing else.
      start_date: p.start_date || null,
      plan_days: n(p.plan_days) || null,
      area_sqft: n(p.area_sqft) || null,
      budget: round(budget),
      labour: round(t.labour),
      material: round(t.material),
      other: round(t.other),
      cost: round(cost),
      received: round(t.received),
      pct_done: round(pct_done),
      pct_spent: round(pct_spent),
      earned: round(earned),
      cpi: cpi == null ? null : Math.round(cpi * 1000) / 1000,
      at_finish: at_finish == null ? null : round(at_finish),
      profit: at_finish == null || budget <= 0 ? null : round(budget - at_finish),
      flag_bn: budget <= 0 ? 'বাজেট দেওয়া নেই'
        : gap > 15 ? 'খরচ কাজের অনেক আগে'
        : gap > 6 ? 'খরচ কাজের থেকে এগিয়ে'
        : 'ঠিক আছে',
      burn: await burn(db, hid, p, pct_done),
      // The spend curve, so the chart on his phone is drawn from rows rather
      // than guessed by a model that has only totals to work from.
      spend: await spendCurve(db, hid, p),
    })
  }

  const counted = lastCount.cash_counted == null ? null : n(lastCount.cash_counted)
  const computed = lastCount.cash_computed == null ? null : n(lastCount.cash_computed)

  const dues = net(openRows.filter((r) => r.dir === 'in' || r.dir === 'transfer'), settlements, 'paid')
  const owed = net(openRows.filter((r) => r.dir === 'sale'), settlements, 'received')

  return {
    generated_at: new Date().toISOString(),
    business: {
      cash_counted: counted,
      cash_counted_on: lastCount.date || null,
      cash_computed: computed,
      cash_variance: counted == null || computed == null ? null : round(counted - computed),
      dues_total: round(dues.total),
      dues_overdue: round(dues.overdue),
      dues_this_week: round(dues.week),
      receivable_total: round(owed.total),
      receivable_overdue: round(owed.overdue),
      receivable_this_week: round(owed.week),
      shop_stock_value: round(stock.value),
      spend_this_month: round(n(monthly.wages) + n(monthly.material) + n(monthly.other)),
      wages_this_month: round(monthly.wages),
      received_this_month: round(monthly.received),
      drawings_this_month: round(monthly.drawings),
      entries_last_3_days: n(activity.last3),
      last_entry_date: activity.last_date || null,
      active_projects: n(activity.active),
      workers_active: n(activity.men),
    },
    projects: perProject,
  }
}

/** Stage weights, with reversed rows cancelled. Half counts half. */
function stagePercent(project, stages, progress) {
  const mine = stages.filter((s) => s.project_type === project.ptype)
  if (!mine.length) return 0
  const total = mine.reduce((a, s) => a + n(s.weight), 0) || 100

  const reversed = new Set(progress.filter((r) => r.reverses).map((r) => r.reverses))
  const live = progress.filter((r) => r.project_id === project.id && !r.reverses && !reversed.has(r.id))

  const best = new Map()
  for (const r of live) {
    if (best.get(r.stage_seq) === 'done') continue
    if (best.get(r.stage_seq) === 'half' && r.state === 'half') continue
    best.set(r.stage_seq, r.state)
  }
  let done = 0
  for (const s of mine) {
    const state = best.get(s.seq)
    if (state === 'done') done += n(s.weight)
    else if (state === 'half') done += n(s.weight) / 2
  }
  return Math.min(100, (done / total) * 100)
}

/* Money actually spent on one job, day by day, added up as it goes.

   Wages, material and site expenses are three tables; they are summed per
   date, merged, then accumulated. What comes back is at most thirty points —
   enough to draw the line, small enough to hand to a model — each one a real
   day with a real running total. Nothing here is estimated.

   `plan` is deliberately NOT computed: it depends only on the budget and the
   planned days, both of which the caller already has, and a straight line
   drawn twice in two places is a straight line that will one day disagree. */
async function spendCurve(db, hid, project) {
  const rows = await all(db, `
    SELECT date, SUM(amount) AS amount FROM (
      SELECT date, amount FROM attendance WHERE household_id = ?1 AND project_id = ?2
      UNION ALL
      SELECT date, amount FROM stock WHERE household_id = ?1 AND project_id = ?2 AND dir IN ('in','transfer')
      UNION ALL
      SELECT date, amount FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'paid' AND personal = 0
    ) GROUP BY date ORDER BY date`, hid, project.id)
  if (!rows.length) return { days: [], cum: [] }

  const start = project.start_date || rows[0].date
  const day = (d) => Math.max(0, Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000))

  const days = []
  const cum = []
  let running = 0
  for (const r of rows) {
    running += n(r.amount)
    const d = day(r.date)
    // Two entries on one day are one point, not two.
    if (days.length && days[days.length - 1] === d) cum[cum.length - 1] = round(running)
    else { days.push(d); cum.push(round(running)) }
  }

  // Thin it to about thirty points, always keeping the first and the last.
  const MAX = 30
  if (days.length <= MAX) return { days, cum }
  const keep = new Set([0, days.length - 1])
  const step = (days.length - 1) / (MAX - 1)
  for (let i = 0; i < MAX; i++) keep.add(Math.round(i * step))
  const idx = [...keep].sort((a, b) => a - b)
  return { days: idx.map((i) => days[i]), cum: idx.map((i) => cum[i]) }
}

/** Material consumed against the coefficient estimate — the theft-or-waste signal. */
async function burn(db, hid, project, pctDone) {
  if (!n(project.area_sqft)) return []
  const rows = await all(db, `SELECT s.item_id, i.name_bn, SUM(s.qty) AS used, c.per_sqft
       FROM stock s
       JOIN items i ON i.household_id = s.household_id AND i.id = s.item_id
       LEFT JOIN coefficients c ON c.household_id = s.household_id
            AND c.item_id = s.item_id AND c.project_type = ?3
      WHERE s.household_id = ?1 AND s.project_id = ?2 AND s.dir IN ('in','transfer')
      GROUP BY s.item_id`, hid, project.id, project.ptype)

  return rows
    .map((r) => {
      const est = n(r.per_sqft) * n(project.area_sqft)
      const pct = est > 0 ? (n(r.used) / est) * 100 : 0
      const gap = pct - pctDone
      return {
        item_bn: r.name_bn,
        used: round(r.used),
        est: round(est),
        pct: round(pct),
        status: est <= 0 ? 'info' : gap > 20 ? 'crit' : gap > 8 ? 'warn' : 'ok',
      }
    })
    .filter((r) => r.est > 0)
    .sort((a, b) => b.pct - a.pct)
}
