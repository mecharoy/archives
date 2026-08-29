/* Everything the dashboard and the nightly run read.

   All of it is computed here, once, from the stored rows — never sent up by
   the phone and never re-derived by a model. Reversal rows carry negative
   amounts, so the money sums net out on their own; only the stage percentage
   needs to know that a reversed row is cancelled, and that is the one thing
   done in JavaScript rather than SQL.

   The reporting period is a WEEK — the last seven days including today, with
   the seven before it alongside for comparison. A month is too long to act
   on: by the time a monthly figure looks wrong, three weeks of it are already
   spent. Where a monthly figure genuinely reads better it is labelled
   `last_28_days`, never "this month", so nobody mistakes it for a calendar
   month that resets on the 1st. */

const WEEK = "date('now','localtime','-6 day')"        // last 7 days, today included
const PREV_FROM = "date('now','localtime','-13 day')"  // the 7 before that
const PREV_TO = "date('now','localtime','-7 day')"
const M28 = "date('now','localtime','-27 day')"        // four whole weeks

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

/* Money moved from the business into the household. Not a household expense
   and not a business cost — a transfer, and it has to be kept out of both
   or it is counted twice. */
const DRAWING_HEAD = 'ব্যবসা থেকে নেওয়া'

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
  const [
    projects, stages, progress, lastCount, openRows, settlements,
    thisWeek, prevWeek, activity, stock,
    heads, suppliers, workmen, goods, personalRows, personalTotals, counts, billRows,
  ] = await Promise.all([
    all(db, 'SELECT id, name_bn, client_bn, ptype, budget, area_sqft, start_date, plan_days, status FROM projects WHERE household_id = ?1 ORDER BY status, name_bn', hid),
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

    periodTotals(db, hid, `date >= ${WEEK}`),
    periodTotals(db, hid, `date >= ${PREV_FROM} AND date < ${PREV_TO}`),

    one(db, `SELECT
               (SELECT COUNT(*) FROM day WHERE household_id = ?1
                 AND date >= date('now','localtime','-2 day')) AS last3,
               (SELECT COUNT(DISTINCT date) FROM day WHERE household_id = ?1 AND date >= ${WEEK}) AS days_week,
               (SELECT COUNT(DISTINCT date) FROM day WHERE household_id = ?1
                 AND date >= ${PREV_FROM} AND date < ${PREV_TO}) AS days_prev,
               (SELECT MAX(date) FROM day WHERE household_id = ?1) AS last_date,
               (SELECT COUNT(*) FROM projects WHERE household_id = ?1 AND status = 'active') AS active,
               (SELECT COUNT(*) FROM workers WHERE household_id = ?1 AND active = 1) AS men`, hid),
    one(db, `SELECT
               COALESCE(SUM(CASE WHEN project_id = '' AND dir = 'in' THEN amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN dir IN ('sale','transfer') THEN amount ELSE 0 END), 0) AS value
             FROM stock WHERE household_id = ?1`, hid),

    /* ---- the four breakdowns, over the week ---- */

    // What the site money went on, biggest first. Settling an old bill is not
    // a cost and is excluded, or every payment week would look like a spree.
    all(db, `SELECT head_bn,
                    COALESCE(SUM(CASE WHEN date >= ${WEEK} THEN amount ELSE 0 END), 0) AS week,
                    COALESCE(SUM(amount), 0) AS last_28_days,
                    COUNT(*) AS times
             FROM money
             WHERE household_id = ?1 AND personal = 0 AND dir = 'paid'
               AND head_bn <> ?2 AND date >= ${M28}
             GROUP BY head_bn HAVING last_28_days <> 0 ORDER BY week DESC, last_28_days DESC LIMIT 12`, hid, SETTLE_HEAD),

    // Which shop the material came from, and what is still unpaid to them.
    all(db, `SELECT COALESCE(p.name_bn, '(নাম নেই)') AS name_bn, s.party_id,
                    COALESCE(SUM(CASE WHEN s.date >= ${WEEK} THEN s.amount ELSE 0 END), 0) AS week,
                    COALESCE(SUM(s.amount), 0) AS last_28_days,
                    COALESCE(SUM(CASE WHEN s.paid = 0 THEN s.amount ELSE 0 END), 0) AS unpaid,
                    COUNT(*) AS times
             FROM stock s LEFT JOIN parties p ON p.household_id = s.household_id AND p.id = s.party_id
             WHERE s.household_id = ?1 AND s.dir IN ('in','transfer') AND s.date >= ${M28}
             GROUP BY s.party_id ORDER BY week DESC, last_28_days DESC LIMIT 10`, hid),

    // Who worked, how many days, what they were paid, what they took as advance.
    all(db, `SELECT COALESCE(w.name_bn, '(নাম নেই)') AS name_bn, a.worker_id,
                    COALESCE(SUM(CASE WHEN a.date >= ${WEEK} THEN a.days ELSE 0 END), 0) AS days_week,
                    COALESCE(SUM(CASE WHEN a.date >= ${WEEK} THEN a.amount ELSE 0 END), 0) AS paid_week,
                    COALESCE(SUM(CASE WHEN a.date >= ${WEEK} THEN a.advance ELSE 0 END), 0) AS advance_week,
                    COALESCE(SUM(a.days), 0) AS days_28
             FROM attendance a LEFT JOIN workers w ON w.household_id = a.household_id AND w.id = a.worker_id
             WHERE a.household_id = ?1 AND a.date >= ${M28}
             GROUP BY a.worker_id ORDER BY paid_week DESC, days_28 DESC LIMIT 25`, hid),

    // What was actually bought, in his own units.
    all(db, `SELECT COALESCE(i.name_bn, '(নাম নেই)') AS name_bn, COALESCE(i.unit_bn, '') AS unit_bn,
                    COALESCE(SUM(CASE WHEN s.date >= ${WEEK} THEN s.qty ELSE 0 END), 0) AS qty_week,
                    COALESCE(SUM(CASE WHEN s.date >= ${WEEK} THEN s.amount ELSE 0 END), 0) AS week,
                    COALESCE(SUM(s.amount), 0) AS last_28_days,
                    MAX(s.rate) AS top_rate, MIN(s.rate) AS low_rate
             FROM stock s LEFT JOIN items i ON i.household_id = s.household_id AND i.id = s.item_id
             WHERE s.household_id = ?1 AND s.dir IN ('in','transfer') AND s.date >= ${M28}
             GROUP BY s.item_id ORDER BY week DESC, last_28_days DESC LIMIT 12`, hid),

    /* ---- the household book ---- */

    // His own spending, by head. Money taken out of the business is a
    // transfer, not a household expense, and is reported on its own below.
    all(db, `SELECT head_bn,
                    COALESCE(SUM(CASE WHEN date >= ${WEEK} THEN amount ELSE 0 END), 0) AS week,
                    COALESCE(SUM(amount), 0) AS last_28_days,
                    COUNT(*) AS times
             FROM money
             WHERE household_id = ?1 AND personal = 1 AND dir = 'paid'
               AND head_bn <> ?2 AND date >= ${M28}
             GROUP BY head_bn HAVING last_28_days <> 0 ORDER BY last_28_days DESC LIMIT 12`, hid, DRAWING_HEAD),

    one(db, `SELECT
               (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1
                 AND personal = 1 AND dir = 'paid' AND head_bn <> '${DRAWING_HEAD}' AND date >= ${WEEK}) AS spent_week,
               (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1
                 AND personal = 1 AND dir = 'paid' AND head_bn <> '${DRAWING_HEAD}' AND date >= ${M28}) AS spent_28,
               (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1
                 AND personal = 1 AND dir = 'paid' AND head_bn <> '${DRAWING_HEAD}'
                 AND date >= ${PREV_FROM} AND date < ${PREV_TO}) AS spent_prev,
               (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1
                 AND personal = 1 AND head_bn = '${DRAWING_HEAD}' AND date >= ${WEEK}) AS drawn_week,
               (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1
                 AND personal = 1 AND head_bn = '${DRAWING_HEAD}' AND date >= ${M28}) AS drawn_28`, hid),

    one(db, `SELECT
               (SELECT COUNT(*) FROM day WHERE household_id = ?1) AS days,
               (SELECT COUNT(*) FROM attendance WHERE household_id = ?1) AS attendance,
               (SELECT COUNT(*) FROM stock WHERE household_id = ?1) AS stock,
               (SELECT COUNT(*) FROM money WHERE household_id = ?1) AS money,
               (SELECT COUNT(*) FROM money WHERE household_id = ?1 AND personal = 1) AS personal,
               (SELECT COUNT(*) FROM progress WHERE household_id = ?1) AS progress,
               (SELECT MIN(date) FROM day WHERE household_id = ?1) AS first_date`, hid),

    /* Payments he has written down himself — rent, a fee, a promise to a
       person. Unpaid ones only: a paid one is history, not a warning. */
    all(db, `SELECT name_bn, to_bn, amount, due_date, repeat, personal, note
             FROM bills WHERE household_id = ?1 AND COALESCE(paid_on,'') = ''
             ORDER BY due_date LIMIT 40`, hid),
  ])

  const perProject = []
  for (const p of projects) {
    const t = await one(db, `SELECT
        (SELECT COALESCE(SUM(amount),0) FROM attendance WHERE household_id = ?1 AND project_id = ?2) AS labour,
        (SELECT COALESCE(SUM(amount),0) FROM stock WHERE household_id = ?1 AND project_id = ?2 AND dir IN ('in','transfer')) AS material,
        (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'paid' AND personal = 0) AS other,
        (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'received' AND personal = 0) AS received,
        (SELECT COALESCE(SUM(amount),0) FROM attendance WHERE household_id = ?1 AND project_id = ?2 AND date >= ${WEEK}) AS labour_week,
        (SELECT COALESCE(SUM(amount),0) FROM stock WHERE household_id = ?1 AND project_id = ?2 AND dir IN ('in','transfer') AND date >= ${WEEK}) AS material_week,
        (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'paid' AND personal = 0 AND date >= ${WEEK}) AS other_week,
        (SELECT COALESCE(SUM(amount),0) FROM money WHERE household_id = ?1 AND project_id = ?2 AND dir = 'received' AND personal = 0 AND date >= ${WEEK}) AS received_week,
        (SELECT COALESCE(SUM(days),0) FROM attendance WHERE household_id = ?1 AND project_id = ?2 AND date >= ${WEEK}) AS mandays_week`,
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
      client_bn: p.client_bn || null,
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
      unbilled: round(earned - n(t.received)),
      pct_done: round(pct_done),
      pct_spent: round(pct_spent),
      earned: round(earned),
      cpi: cpi == null ? null : Math.round(cpi * 1000) / 1000,
      at_finish: at_finish == null ? null : round(at_finish),
      profit: at_finish == null || budget <= 0 ? null : round(budget - at_finish),
      cost_per_sqft: n(p.area_sqft) > 0 ? round(cost / n(p.area_sqft)) : null,
      // What happened on this job in the last seven days, so a week that went
      // quiet on one site is visible even while the totals still look fine.
      week: {
        labour: round(t.labour_week),
        material: round(t.material_week),
        other: round(t.other_week),
        received: round(t.received_week),
        spend: round(n(t.labour_week) + n(t.material_week) + n(t.other_week)),
        mandays: round(t.mandays_week),
      },
      stage_now_bn: currentStage(p, stages, progress),
      days_running: p.start_date ? daysBetween(p.start_date) : null,
      flag_bn: budget <= 0 ? 'বাজেট দেওয়া নেই'
        : gap > 15 ? 'খরচ কাজের অনেক আগে'
        : gap > 6 ? 'খরচ কাজের থেকে এগিয়ে'
        : 'ঠিক আছে',
      burn: await burn(db, hid, p, pct_done),
      // Where this job's money actually went, so "spending is ahead" can be
      // followed by "on what".
      heads: await all(db, `SELECT head_bn, COALESCE(SUM(amount),0) AS amount, COUNT(*) AS times
             FROM money WHERE household_id = ?1 AND project_id = ?2 AND personal = 0 AND dir = 'paid'
             GROUP BY head_bn HAVING amount <> 0 ORDER BY amount DESC LIMIT 10`, hid, p.id),
      items: await all(db, `SELECT COALESCE(i.name_bn,'(নাম নেই)') AS name_bn, COALESCE(i.unit_bn,'') AS unit_bn,
                    COALESCE(SUM(s.qty),0) AS qty, COALESCE(SUM(s.amount),0) AS amount
             FROM stock s LEFT JOIN items i ON i.household_id = s.household_id AND i.id = s.item_id
             WHERE s.household_id = ?1 AND s.project_id = ?2 AND s.dir IN ('in','transfer')
             GROUP BY s.item_id ORDER BY amount DESC LIMIT 12`, hid, p.id),
      // The spend curve, so the chart on his phone is drawn from rows rather
      // than guessed by a model that has only totals to work from.
      spend: await spendCurve(db, hid, p),
    })
  }

  const counted = lastCount.cash_counted == null ? null : n(lastCount.cash_counted)
  const computed = lastCount.cash_computed == null ? null : n(lastCount.cash_computed)

  const dues = net(openRows.filter((r) => r.dir === 'in' || r.dir === 'transfer'), settlements, 'paid')
  const owed = net(openRows.filter((r) => r.dir === 'sale'), settlements, 'received')

  const spendWeek = n(thisWeek.wages) + n(thisWeek.material) + n(thisWeek.other)
  const spendPrev = n(prevWeek.wages) + n(prevWeek.material) + n(prevWeek.other)

  return {
    generated_at: new Date().toISOString(),
    period: {
      unit: 'week',
      from: isoDaysAgo(6),
      to: isoDaysAgo(0),
      prev_from: isoDaysAgo(13),
      prev_to: isoDaysAgo(7),
    },
    business: {
      cash_counted: counted,
      cash_counted_on: lastCount.date || null,
      cash_computed: computed,
      cash_variance: counted == null || computed == null ? null : round(counted - computed),
      // "this week" on a due date means falling due in the next seven days.
      dues_total: round(dues.total),
      dues_overdue: round(dues.overdue),
      dues_this_week: round(dues.week),
      receivable_total: round(owed.total),
      receivable_overdue: round(owed.overdue),
      receivable_this_week: round(owed.week),
      shop_stock_value: round(stock.value),
      // "this week" on a spend means the last seven days.
      spend_this_week: round(spendWeek),
      wages_this_week: round(thisWeek.wages),
      material_this_week: round(thisWeek.material),
      other_this_week: round(thisWeek.other),
      received_this_week: round(thisWeek.received),
      drawings_this_week: round(personalTotals.drawn_week),
      spend_prev_week: round(spendPrev),
      wages_prev_week: round(prevWeek.wages),
      received_prev_week: round(prevWeek.received),
      spend_change_pct: spendPrev > 0 ? round(((spendWeek - spendPrev) / spendPrev) * 100) : null,
      entries_last_3_days: n(activity.last3),
      days_entered_this_week: n(activity.days_week),
      days_entered_prev_week: n(activity.days_prev),
      last_entry_date: activity.last_date || null,
      active_projects: n(activity.active),
      workers_active: n(activity.men),
    },
    /* The four site breakdowns. Every row carries the week and the four-week
       figure beside it, so "high" and "unusual" are different questions. */
    breakdown: {
      heads: heads.map((r) => ({ head_bn: r.head_bn, week: round(r.week), last_28_days: round(r.last_28_days), times: n(r.times) })),
      suppliers: suppliers.map((r) => ({
        name_bn: r.name_bn, week: round(r.week), last_28_days: round(r.last_28_days),
        unpaid: round(r.unpaid), times: n(r.times),
      })),
      workers: workmen.map((r) => ({
        name_bn: r.name_bn, days_week: round(r.days_week), paid_week: round(r.paid_week),
        advance_week: round(r.advance_week), days_28: round(r.days_28),
      })),
      items: goods.map((r) => ({
        name_bn: r.name_bn, unit_bn: r.unit_bn, qty_week: round(r.qty_week),
        week: round(r.week), last_28_days: round(r.last_28_days),
        // A rate that moved inside four weeks is worth a sentence.
        rate_low: round(r.low_rate), rate_high: round(r.top_rate),
      })),
    },
    /* Dates he has set for himself. Overdue first, because a missed rent day
       is the one thing on this page that costs him a relationship. */
    bills: billList(billRows),
    /* His own book, kept apart from the business exactly as the app keeps it.
       Drawings are a transfer out of the business, not a household expense,
       so they are reported separately and never added to `spent`. */
    personal: {
      spent_this_week: round(personalTotals.spent_week),
      spent_prev_week: round(personalTotals.spent_prev),
      spent_last_28_days: round(personalTotals.spent_28),
      drawn_this_week: round(personalTotals.drawn_week),
      drawn_last_28_days: round(personalTotals.drawn_28),
      // Taking out more than the household spends is not a problem; taking
      // out less means the household is being fed from somewhere else.
      heads: personalRows.map((r) => ({
        head_bn: r.head_bn, week: round(r.week), last_28_days: round(r.last_28_days), times: n(r.times),
      })),
    },
    /* How much ledger there is to reason over. A confident insight drawn from
       nine rows is worse than no insight, and this is how the reader knows. */
    coverage: {
      days_recorded: n(counts.days),
      first_entry_date: counts.first_date || null,
      rows: {
        attendance: n(counts.attendance), stock: n(counts.stock),
        money: n(counts.money), personal: n(counts.personal), progress: n(counts.progress),
      },
    },
    projects: perProject,
  }
}

/** Bills he has written down, split into the two books and the three urgencies. */
function billList(rows) {
  const today = new Date().toISOString().slice(0, 10)
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const shape = (r) => ({
    name_bn: r.name_bn, to_bn: r.to_bn || null, amount: round(r.amount),
    due_date: r.due_date, repeat: r.repeat || 'once',
    personal: Boolean(r.personal),
    days_away: Math.round((Date.parse(r.due_date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000),
    overdue: r.due_date < today,
  })
  const all = rows.map(shape)
  const sum = (list) => round(list.reduce((a, x) => a + n(x.amount), 0))
  const split = (personal) => {
    const mine = all.filter((x) => x.personal === personal)
    const late = mine.filter((x) => x.overdue)
    const soon = mine.filter((x) => !x.overdue && x.due_date <= week)
    return { total: sum(mine), overdue: sum(late), this_week: sum(soon), count: mine.length }
  }
  return { personal: split(true), business: split(false), list: all.slice(0, 25) }
}

/** Wages, material and site expenses over one date range. */
async function periodTotals(db, hid, where) {
  return one(db, `SELECT
      (SELECT COALESCE(SUM(amount),0) FROM attendance WHERE household_id = ?1 AND ${where}) AS wages,
      (SELECT COALESCE(SUM(amount),0) FROM stock
        WHERE household_id = ?1 AND ${where} AND dir IN ('in','transfer')) AS material,
      (SELECT COALESCE(SUM(amount),0) FROM money
        WHERE household_id = ?1 AND ${where} AND dir = 'paid' AND personal = 0
          AND head_bn <> '${SETTLE_HEAD}') AS other,
      (SELECT COALESCE(SUM(amount),0) FROM money
        WHERE household_id = ?1 AND ${where} AND dir = 'received' AND personal = 0) AS received`, hid)
}

const isoDaysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
const daysBetween = (from) => Math.max(0, Math.round((Date.now() - Date.parse(from + 'T00:00:00Z')) / 86400000))

/** Stage weights, with reversed rows cancelled. Half counts half. */
function stagePercent(project, stages, progress) {
  const mine = stages.filter((s) => s.project_type === project.ptype)
  if (!mine.length) return 0
  const total = mine.reduce((a, s) => a + n(s.weight), 0) || 100

  const best = bestStates(project, progress)
  let done = 0
  for (const s of mine) {
    const state = best.get(s.seq)
    if (state === 'done') done += n(s.weight)
    else if (state === 'half') done += n(s.weight) / 2
  }
  return Math.min(100, (done / total) * 100)
}

/** The first stage not finished — what the men are actually on right now. */
function currentStage(project, stages, progress) {
  const mine = stages.filter((s) => s.project_type === project.ptype).sort((a, b) => n(a.seq) - n(b.seq))
  if (!mine.length) return null
  const best = bestStates(project, progress)
  for (const s of mine) if (best.get(s.seq) !== 'done') return s.name_bn
  return null // every stage done
}

/** The best state reached per stage, with reversed rows cancelled. */
function bestStates(project, progress) {
  const reversed = new Set(progress.filter((r) => r.reverses).map((r) => r.reverses))
  const live = progress.filter((r) => r.project_id === project.id && !r.reverses && !reversed.has(r.id))
  const best = new Map()
  for (const r of live) {
    if (best.get(r.stage_seq) === 'done') continue
    if (best.get(r.stage_seq) === 'half' && r.state === 'half') continue
    best.set(r.stage_seq, r.state)
  }
  return best
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
