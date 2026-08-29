/* The nightly job, exercised end to end without the network and without a
   model — because the parts that can quietly put a wrong number on his phone
   are exactly the parts that do not involve either.

   `npm run nightly:check`, and it is part of `npm test`. */

import { skeleton, plainHeadline, money, groupIndian } from '../nightly/compute.mjs'
import { check, _test } from '../nightly/check.mjs'

let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}

/* ---------- a ledger with one thing wrong in every direction ---------- */

const SUMMARY = {
  generated_at: '2026-08-29T21:00:00Z',
  business: {
    cash_counted: 48200, cash_counted_on: '2026-08-28', cash_computed: 45000,
    cash_variance: 3200,
    dues_total: 62000, dues_overdue: 12400, dues_this_week: 8000,
    receivable_total: 25000, receivable_overdue: 0, receivable_this_week: 25000,
    shop_stock_value: 14000,
    spend_this_month: 210000, wages_this_month: 84000,
    received_this_month: 150000, drawings_this_month: 20000,
    entries_last_3_days: 2, last_entry_date: '2026-08-28',
    active_projects: 1, workers_active: 6,
  },
  projects: [{
    id: 'p1', name_bn: 'রামপুর বাড়ি', status: 'active',
    start_date: '2026-06-01', plan_days: 120, area_sqft: 1200,
    budget: 1800000, labour: 300000, material: 500000, other: 40000,
    cost: 840000, received: 600000,
    pct_done: 35, pct_spent: 46.7, earned: 630000, cpi: 0.75,
    at_finish: 2400000, profit: -600000, flag_bn: 'খরচ কাজের অনেক আগে',
    burn: [{ item_bn: 'রড', used: 4.2, est: 3.6, pct: 116, status: 'crit' }],
    spend: { days: [0, 30, 60, 89], cum: [0, 210000, 520000, 840000] },
  }],
}

/* ---------- the numbers ---------- */

ck('indian grouping', groupIndian(1234567), '12,34,567')
ck('money is rounded whole rupees', money(48200.4), '₹48,200')

const base = skeleton(SUMMARY)
ck('cash card leads', base.cards[0].label_en, 'Cash in hand')
ck('a 3200 drift is flagged', base.cards[0].status, 'warn')
ck('the drift says which way', base.cards[0].sub_en, '₹3,200 more than the book')
ck('overdue dues are critical', base.cards[1].status, 'crit')
ck('nothing overdue to him is only a warning', base.cards[2].status, 'warn')
ck('both languages on every card', base.cards.every((c) => c.label_bn && c.label_en && c.sub_bn && c.sub_en), 'true')

ck('cpi under 1 makes the job critical', base.projects[0].status, 'crit')
ck('percentages are whole numbers', base.projects[0].pct_spent, 47)

const sc = base.series.scurve
ck('the s-curve uses his real days', sc.days.join(','), '0,30,60,89')
ck('actual comes from the rows, in lakh', sc.actual.join(','), '0,2.1,5.2,8.4')
ck('plan is the straight line his budget describes', sc.plan.map((x) => Math.round(x * 10) / 10).join(','), '0,4.5,9,13.4')
ck('burn is carried through', base.series.burn[0].pct, 116)

/* An empty ledger must still produce a brief, not a crash. */
const EMPTY = { business: { cash_counted: null, cash_variance: null, dues_total: 0, dues_overdue: 0, dues_this_week: 0, receivable_total: 0, receivable_overdue: 0, receivable_this_week: 0, shop_stock_value: 0, spend_this_month: 0, wages_this_month: 0, entries_last_3_days: 0, last_entry_date: null }, projects: [] }
const bare = skeleton(EMPTY)
ck('an empty ledger still makes cards', bare.cards.length > 0, 'true')
ck('an uncounted till says so', bare.cards[0].sub_en, 'not counted yet')
ck('no entries in 3 days is shouted', bare.cards.some((c) => c.status === 'crit'), 'true')
ck('no jobs means no s-curve', bare.series.scurve, 'undefined')
/* Stock below zero means goods left that were never entered as bought. */
const NEG = { ...EMPTY, business: { ...EMPTY.business, shop_stock_value: -500 } }
const neg = skeleton(NEG).cards.find((c) => c.label_en === 'Stock in the shop')
ck('negative stock reaches the cards', Boolean(neg), 'true')
ck('and it is shouted, not filed away', neg.status, 'crit')
ck('positive stock stays quiet', skeleton({ ...EMPTY, business: { ...EMPTY.business, shop_stock_value: 500 } }).cards.find((c) => c.label_en === 'Stock in the shop').status, 'info')

ck('the plain headline leads with the silence', plainHeadline(EMPTY).en, 'No day has been entered for three days.')

/* ---------- the checker ---------- */

const ids = new Set(['p1'])
const good = {
  headline_bn: 'রামপুর বাড়িতে খরচ কাজের থেকে অনেক এগিয়ে।',
  headline_en: 'At Rampur the spending is well ahead of the work.',
  project_notes: [{ id: 'p1', status: 'crit', note_bn: 'কাজ ৩৫% হয়েছে, খরচ ৪৭%।', note_en: 'Work is 35% done, spending is at 47%.' }],
  alerts: [{ severity: 'warn', text_bn: 'রড দ্রুত ফুরোচ্ছে।', text_en: 'Steel is going faster than the work.' }],
  todo_bn: ['রডের হিসাব মিলিয়ে নিন', 'দোকানের বাকি তারিখ পেরিয়েছে — ফোন করুন'],
  todo_en: ['Check the steel count', 'A shop bill is past its date — call them'],
}
let r = check(good, SUMMARY, ids)
ck('a clean answer passes whole', r.dropped.length, 0)
ck('the headline survives', r.headline.en, good.headline_en)
ck('the note lands on the job', r.notes.get('p1').note_en, good.project_notes[0].note_en)
ck('both to-dos survive', r.todo_bn.length, 2)

/* The failure this whole design exists to stop. */
const invented = { ...good, headline_bn: 'দোকানে ৯৯,৯৯৯ টাকা বাকি।', headline_en: 'He owes shops ₹99,999.' }
r = check(invented, SUMMARY, ids)
ck('an invented figure is refused', r.headline, 'null')
ck('and it is named in the log', /invented figure 99999/.test(r.dropped.join(' ')), 'true')

/* A real figure quoted from the summary is allowed through. */
r = check({ ...good, headline_bn: 'দোকানে ৬২০০০ টাকা বাকি।', headline_en: 'He owes shops 62000.' }, SUMMARY, ids)
ck('a figure that is in the summary passes', r.headline == null, 'false')

/* Bengali digits are read as digits, not decoration. */
ck('Bengali digits are decoded', _test.figures('৯৯,৯৯৯ টাকা').join(','), '99999')

/* Half a translation is worse than none. */
r = check({ ...good, headline_en: '' }, SUMMARY, ids)
ck('a headline in one language only is refused', r.headline, 'null')
r = check({ ...good, alerts: [{ severity: 'crit', text_bn: 'কিছু একটা', text_en: '' }] }, SUMMARY, ids)
ck('a one-language alert is dropped', r.alerts.length, 0)
r = check({ ...good, todo_en: ['only one'] }, SUMMARY, ids)
ck('lists that drifted apart are dropped whole', r.todo_bn.length, 0)

/* A note cannot be attached to a job that is not there. */
r = check({ ...good, project_notes: [{ id: 'nope', note_bn: 'ক', note_en: 'k' }] }, SUMMARY, ids)
ck('a note on an unknown job is dropped', r.notes.size, 0)

/* Small numbers — days, men, percentages — are not money and stay. */
r = check({ ...good, headline_bn: '৬ জন লোক, ৩৫% কাজ।', headline_en: '6 men, 35% of the work done.' }, SUMMARY, ids)
ck('counts and percentages are left alone', r.headline == null, 'false')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
