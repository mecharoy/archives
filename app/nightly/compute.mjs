/* Everything in the brief that is a number.

   This file exists because of one rule: a model is asked for sentences, never
   for arithmetic. The cards, the percentages, the two charts and every status
   colour are worked out here, from the summary the server computed out of his
   own rows. The model sees them, writes prose around them, and the prose is
   dropped into the gaps. If the model returns nothing at all, what this file
   produced is still a correct — if silent — brief.

   Everything is in Bengali and English side by side, because the phone can be
   switched to either at any moment and the brief has to already hold both. */

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const has = (v) => typeof v === 'number' && Number.isFinite(v)

/* ---------- money, the way it is written on the phone ---------- */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
export const toBn = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[+d])

/** Indian grouping: 12,34,567 — not 1,234,567. */
export function groupIndian(v) {
  const neg = v < 0
  const s = String(Math.round(Math.abs(v)))
  if (s.length <= 3) return (neg ? '-' : '') + s
  const head = s.slice(0, -3)
  const tail = s.slice(-3)
  return (neg ? '-' : '') + head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail
}

export const money = (v) => '₹' + groupIndian(n(v))

/* ---------- the cards ---------- */

/* Six at most; the phone shows six. Order is deliberate: what he holds, what
   is coming at him, what is coming to him, then the week. */
export function cards(sum) {
  const b = sum.business
  const out = []

  if (has(b.cash_counted)) {
    const v = b.cash_variance
    const off = has(v) && Math.abs(v) > 2000
    out.push({
      label_bn: 'হাতে টাকা', label_en: 'Cash in hand',
      value: money(b.cash_counted),
      sub_bn: has(v)
        ? (Math.abs(v) < 1 ? 'খাতার সঙ্গে মিলছে' : `খাতার থেকে ${money(Math.abs(v))} ${v > 0 ? 'বেশি' : 'কম'}`)
        : 'গোনা হয়েছে',
      sub_en: has(v)
        ? (Math.abs(v) < 1 ? 'matches the book' : `${money(Math.abs(v))} ${v > 0 ? 'more' : 'less'} than the book`)
        : 'counted',
      status: off ? 'warn' : 'ok',
    })
  } else {
    out.push({
      label_bn: 'হাতে টাকা', label_en: 'Cash in hand',
      value: '—', sub_bn: 'এখনও গোনা হয়নি', sub_en: 'not counted yet', status: 'info',
    })
  }

  out.push({
    label_bn: 'দোকানে দেনা', label_en: 'Owed to shops',
    value: money(b.dues_total),
    sub_bn: b.dues_overdue > 0 ? `${money(b.dues_overdue)} তারিখ পেরিয়ে গেছে`
      : b.dues_this_week > 0 ? `${money(b.dues_this_week)} এই সপ্তাহে`
      : 'কোনো তারিখ পেরোয়নি',
    sub_en: b.dues_overdue > 0 ? `${money(b.dues_overdue)} past its date`
      : b.dues_this_week > 0 ? `${money(b.dues_this_week)} due this week`
      : 'nothing past its date',
    status: b.dues_overdue > 0 ? 'crit' : b.dues_this_week > 0 ? 'warn' : 'ok',
  })

  out.push({
    label_bn: 'পাওনা', label_en: 'Owed to him',
    value: money(b.receivable_total),
    sub_bn: b.receivable_overdue > 0 ? `${money(b.receivable_overdue)} দেরি হয়ে গেছে`
      : b.receivable_this_week > 0 ? `${money(b.receivable_this_week)} এই সপ্তাহে`
      : 'সব সময়মতো',
    sub_en: b.receivable_overdue > 0 ? `${money(b.receivable_overdue)} is late`
      : b.receivable_this_week > 0 ? `${money(b.receivable_this_week)} due this week`
      : 'all on time',
    status: b.receivable_overdue > 0 ? 'crit' : b.receivable_this_week > 0 ? 'warn' : 'ok',
  })

  /* A week, not a month. By the time a monthly figure looks wrong, three
     weeks of it are already spent. The week before it sits underneath, so
     "high" and "higher than usual" are visibly different questions. */
  const change = b.spend_change_pct
  out.push({
    label_bn: 'এ সপ্তাহের খরচ', label_en: 'Spent this week',
    value: money(b.spend_this_week),
    sub_bn: change == null ? `মজুরি ${money(b.wages_this_week)}`
      : change > 0 ? `গত সপ্তাহের চেয়ে ${toBn(Math.abs(Math.round(change)))}% বেশি`
      : change < 0 ? `গত সপ্তাহের চেয়ে ${toBn(Math.abs(Math.round(change)))}% কম`
      : 'গত সপ্তাহের সমান',
    sub_en: change == null ? `${money(b.wages_this_week)} of it on wages`
      : change > 0 ? `${Math.abs(Math.round(change))}% more than the week before`
      : change < 0 ? `${Math.abs(Math.round(change))}% less than the week before`
      : 'level with the week before',
    status: change != null && change > 60 ? 'warn' : 'info',
  })

  /* Stock below zero is not a small number — it means goods left the shop that
     were never recorded coming in, so it has to be on screen, not buried. */
  if (n(b.shop_stock_value) < 0) {
    out.push({
      label_bn: 'দোকানের মাল', label_en: 'Stock in the shop',
      value: money(b.shop_stock_value),
      sub_bn: 'যা বেরিয়েছে তার কেনা লেখা হয়নি',
      sub_en: 'goods went out that were never entered as bought',
      status: 'crit',
    })
  } else if (n(b.shop_stock_value) > 0) {
    out.push({
      label_bn: 'দোকানের মাল', label_en: 'Stock in the shop',
      value: money(b.shop_stock_value),
      sub_bn: 'বিক্রির জন্য পড়ে আছে', sub_en: 'sitting unsold', status: 'info',
    })
  }

  /* Dates he set for himself — rent, a fee, a promise. Overdue first,
     because that is the one that costs him a relationship, not just money. */
  const bills = sum.bills && sum.bills.personal
  if (bills && (bills.overdue > 0 || bills.this_week > 0)) {
    out.push({
      label_bn: 'নিজের দেওয়ার তারিখ', label_en: 'His own dates',
      value: money(bills.overdue > 0 ? bills.overdue : bills.this_week),
      sub_bn: bills.overdue > 0 ? 'তারিখ পেরিয়ে গেছে' : 'সাত দিনের মধ্যে দিতে হবে',
      sub_en: bills.overdue > 0 ? 'past the date he set' : 'due within seven days',
      status: bills.overdue > 0 ? 'crit' : 'warn',
    })
  }

  /* Silence is the loudest fact in this ledger: an empty book means every
     other card on this screen is out of date. */
  if (n(b.entries_last_3_days) === 0) {
    out.push({
      label_bn: 'লেখা হয়নি', label_en: 'Nothing written',
      value: b.last_entry_date ? toBn(daysSince(b.last_entry_date)) + ' দিন' : '—',
      sub_bn: 'তিন দিনে একটাও হিসাব ওঠেনি',
      sub_en: 'no day entered in three days',
      status: 'crit',
    })
  }

  return out.slice(0, 6)
}

function daysSince(iso) {
  const d = Math.round((Date.now() - Date.parse(iso + 'T00:00:00')) / 86400000)
  return Math.max(0, d)
}

/* ---------- the jobs ---------- */

/* Status comes from the gap between money spent and work done, and from CPI —
   never from the model, which does not get to decide that a job is fine. */
export function projectStatus(p) {
  if (n(p.budget) <= 0) return 'info'
  if (has(p.cpi) && p.cpi < 0.9) return 'crit'
  const gap = n(p.pct_spent) - n(p.pct_done)
  if (gap > 15 || (has(p.cpi) && p.cpi < 1)) return 'crit'
  if (gap > 6) return 'warn'
  return 'ok'
}

export function projects(sum) {
  return sum.projects
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      name_bn: p.name_bn,
      name_en: p.name_bn, // replaced by the model's transliteration when it gives one
      pct_done: Math.round(n(p.pct_done)),
      pct_spent: Math.round(n(p.pct_spent)),
      status: projectStatus(p),
    }))
}

/* ---------- the two charts ---------- */

/* The S-curve for the biggest active job. `actual` is his real running spend,
   day by day, straight out of the rows. `plan` is the straight line his own
   budget and planned days describe — no curve fitting, no model. Both in
   lakh, because that is the unit he thinks in. */
export function scurve(sum) {
  const live = sum.projects.filter((p) => p.status === 'active' && p.spend && p.spend.days.length > 1)
  if (!live.length) return undefined
  const p = live.sort((a, b) => n(b.budget) - n(a.budget))[0]

  const lakh = (v) => Math.round((n(v) / 100000) * 100) / 100
  const days = p.spend.days.slice()
  const actual = p.spend.cum.map(lakh)

  const span = n(p.plan_days) || days[days.length - 1] || 1
  const budget = n(p.budget)
  // With no budget there is no plan to draw against; the line is then his own
  // spend alone, which is still worth seeing.
  const plan = days.map((d) => (budget > 0 ? lakh((Math.min(d, span) / span) * budget) : 0))

  return { days, plan, actual, unit: 'lakh' }
}

/* Material burn, worst first, across every active job. */
export function burn(sum) {
  const rows = []
  for (const p of sum.projects) {
    if (p.status !== 'active') continue
    for (const b of p.burn || []) {
      rows.push({ item_bn: b.item_bn, item_en: b.item_bn, pct: Math.round(n(b.pct)), status: b.status })
    }
  }
  const seen = new Map()
  for (const r of rows) {
    const old = seen.get(r.item_bn)
    if (!old || r.pct > old.pct) seen.set(r.item_bn, r)
  }
  return [...seen.values()].sort((a, b) => b.pct - a.pct).slice(0, 8)
}

/* ---------- the fallback headline ----------
   Used when the model is unreachable or its answer fails checking. It says
   less than a written one, but every word of it is true. */
export function plainHeadline(sum) {
  const b = sum.business
  if (n(b.entries_last_3_days) === 0) {
    return { bn: 'তিন দিন ধরে হিসাব লেখা হয়নি।', en: 'No day has been entered for three days.' }
  }
  if (has(b.cash_variance) && Math.abs(b.cash_variance) > 2000) {
    return { bn: 'হাতের টাকা খাতার সঙ্গে মিলছে না।', en: 'Cash in hand does not match the book.' }
  }
  if (n(b.dues_overdue) > 0) {
    return { bn: 'দোকানের একটা তারিখ পেরিয়ে গেছে।', en: 'A supplier date has gone past.' }
  }
  if (n(b.receivable_overdue) > 0) {
    return { bn: 'খদ্দেরের টাকা আটকে আছে।', en: 'A customer payment is late.' }
  }
  const bad = sum.projects.filter((p) => p.status === 'active' && projectStatus(p) !== 'ok')
  if (bad.length) return { bn: `${bad[0].name_bn} — খরচ কাজের থেকে এগিয়ে।`, en: `${bad[0].name_bn} — spending is ahead of the work.` }
  return { bn: 'সব ঠিক চলছে।', en: 'Everything is on track.' }
}

/** The half of the brief that never depends on a model. */
export function skeleton(sum) {
  return {
    cards: cards(sum),
    projects: projects(sum),
    series: { scurve: scurve(sum), burn: burn(sum) },
  }
}
