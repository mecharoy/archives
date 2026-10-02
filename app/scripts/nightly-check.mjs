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
    spend_this_week: 52000, wages_this_week: 21000, material_this_week: 28000,
    other_this_week: 3000, received_this_week: 40000, drawings_this_week: 5000,
    spend_prev_week: 40000, wages_prev_week: 18000, received_prev_week: 0,
    spend_change_pct: 30,
    entries_last_3_days: 2, last_entry_date: '2026-08-28',
    days_entered_this_week: 6, days_entered_prev_week: 7,
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
  bills: {
    personal: { total: 9000, overdue: 4000, this_week: 5000, count: 2 },
    business: { total: 0, overdue: 0, this_week: 0, count: 0 },
    list: [{ name_bn: 'ঘরভাড়া', to_bn: 'বাড়িওয়ালা', amount: 4000, due_date: '2026-08-27', repeat: 'monthly', personal: true, days_away: -2, overdue: true }],
  },
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

const spendCard = base.cards.find((c) => c.label_en === 'Spent this week')
ck('the spend card is a week, not a month', Boolean(spendCard), 'true')
ck('and it says how the week compares', spendCard.sub_en, '30% more than the week before')
const billCard = base.cards.find((c) => c.label_en === 'His own dates')
ck('an overdue date he set reaches the cards', billCard.status, 'crit')
ck('showing the overdue amount, not the total', billCard.value, '₹4,000')

ck('cpi under 1 makes the job critical', base.projects[0].status, 'crit')
ck('percentages are whole numbers', base.projects[0].pct_spent, 47)

const sc = base.series.scurve
ck('the s-curve uses his real days', sc.days.join(','), '0,30,60,89')
ck('actual comes from the rows, in lakh', sc.actual.join(','), '0,2.1,5.2,8.4')
ck('plan is the straight line his budget describes', sc.plan.map((x) => Math.round(x * 10) / 10).join(','), '0,4.5,9,13.4')
ck('burn is carried through', base.series.burn[0].pct, 116)

/* An empty ledger must still produce a brief, not a crash. */
const EMPTY = { business: { cash_counted: null, cash_variance: null, dues_total: 0, dues_overdue: 0, dues_this_week: 0, receivable_total: 0, receivable_overdue: 0, receivable_this_week: 0, shop_stock_value: 0, spend_this_week: 0, wages_this_week: 0, spend_change_pct: null, entries_last_3_days: 0, last_entry_date: null }, projects: [] }
const bare = skeleton(EMPTY)
ck('an empty ledger still makes cards', bare.cards.length > 0, 'true')
ck('an uncounted till says so', bare.cards.find((c) => c.label_en === 'Cash in hand').sub_en, 'not counted yet')
ck('and the silence comes first when the book is empty', bare.cards[0].label_en, 'Nothing written')
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

/* ---------- what a small model gets wrong ----------
   The free tier is a small model. These are the slips a small model actually
   makes, each of which looked fine to the first version of the checker. */

const bad = (over, opts) => check({ ...good, ...over }, SUMMARY, ids, opts)
const why = (res) => res.dropped.join(' | ')

/* Money in words cannot be checked against a number, so it is refused. */
r = bad({ headline_bn: 'দোকানে ১২ হাজার টাকা বাকি।', headline_en: 'He owes the shops 12 thousand.' })
ck('"১২ হাজার" is refused', r.headline, 'null')
ck('and named as money in words', /money written in words/.test(why(r)), 'true')
r = bad({ headline_bn: 'দোকানের ১.২ লাখ বাকি।', headline_en: 'The shops are owed 1.2 lakh.' })
ck('"1.2 lakh" is refused', r.headline, 'null')
r = bad({ headline_bn: 'দোকানের বাকি ১২k।', headline_en: 'Shops are owed 12k.' })
ck('"12k" is refused', r.headline, 'null')
r = bad({ headline_bn: 'চায়ে ১২ টাকা গেছে।', headline_en: 'Tea took ₹12.' })
ck('a small rupee figure cannot be checked and is refused', r.headline, 'null')
r = bad({ headline_bn: 'টাকা দিতে হবে।', headline_en: 'Money has to be paid.' })
ck('the word "টাকা" with no figure is fine', r.headline == null, 'false')

/* A percentage must be one the data holds, give or take a rounding. */
r = bad({ headline_bn: 'কাজ ৮০% হয়েছে।', headline_en: 'The work is 80% done.' })
ck('an invented percentage is refused', r.headline, 'null')
ck('and named', /invented percentage 80/.test(why(r)), 'true')
r = bad({ headline_bn: 'কাজ ৩৬% হয়েছে।', headline_en: 'The work is 36% done.' })
ck('a percentage one off the data is a rounding, and passes', r.headline == null, 'false')
r = bad({ headline_bn: 'কাজ ৭০ শতাংশ হয়েছে।', headline_en: 'The work is 70 percent done.' })
ck('"শতাংশ" and "percent" are read as percentages too', r.headline, 'null')

/* A count larger than ten has to come from the data, too. */
r = bad({ headline_bn: '৪০ জন লোক কাজ করেছে।', headline_en: '40 men worked.' })
ck('an invented head-count is refused', r.headline, 'null')
r = bad({ headline_bn: 'শেষ ২৮ দিনের হিসাব।', headline_en: 'The last 28 days.' })
ck('the four-week window is allowed', r.headline == null, 'false')
r = bad({ headline_bn: '২৮ আগস্টের পর কিছু লেখা হয়নি।', headline_en: 'Nothing since 28 August.' })
ck('a date taken from the data is allowed', r.headline == null, 'false')
r = bad({ headline_bn: '৬ জন, ৭ দিন, ৩ কাজ।', headline_en: '6 men, 7 days, 3 jobs.' })
ck('small counts pass', r.headline == null, 'false')
ck('"3, 4" is two figures, not 34', _test.figures('3, 4 and 5').join(','), '3,4,5')
ck('"12,34,567" is one figure', _test.figures('12,34,567').join(','), '1234567')

/* The two languages must really be two languages. */
r = bad({ headline_bn: 'Spending is ahead of the work', headline_en: 'Spending is ahead of the work' })
ck('English in the Bengali field is refused', /no Bengali/.test(why(r)), 'true')
r = bad({ headline_bn: 'খরচ কাজের আগে', headline_en: 'খরচ কাজের আগে' })
ck('Bengali in the English field is refused', /no English/.test(why(r)), 'true')
r = bad({ headline_bn: 'রড steel', headline_en: 'রড steel' })
ck('the same text in both is refused', /same text/.test(why(r)), 'true')
r = bad({ headline_bn: 'খরচ কাজের আগে। '.repeat(20), headline_en: 'Spending is ahead of the work. '.repeat(10) })
ck('a sentence too long to show whole is refused', /too long/.test(why(r)), 'true')

/* Name labels. The phone issues [W1]; anything else is an invention. */
const labels = new Set(['[J1]', '[W1]', '[W12]'])
r = bad({ headline_bn: '[W1]-কে ফোন করুন', headline_en: 'Call [W1]' }, { labels })
ck('a label the phone issued passes', r.headline == null, 'false')
r = bad({ headline_bn: '[W2]-কে ফোন করুন', headline_en: 'Call [W2]' }, { labels })
ck('a label the phone never issued is refused', /unknown label \[W2\]/.test(why(r)), 'true')
r = bad({ headline_bn: '[W12]-কে ফোন করুন', headline_en: 'Call [W12]' }, { labels })
ck('digits inside a label are not figures', r.headline == null, 'false')
r = bad({ headline_bn: '[W1]-কে ফোন করুন', headline_en: 'Call [W1]' })
ck('with no labels expected, none are policed', r.headline == null, 'false')

/* One note per job; the first wins. */
r = bad({ project_notes: [
  { id: 'p1', status: 'warn', note_bn: 'প্রথম নোট।', note_en: 'First note.' },
  { id: 'p1', status: 'ok', note_bn: 'দ্বিতীয় নোট।', note_en: 'Second note.' },
] })
ck('a second note for a job is dropped', r.notes.get('p1').note_en, 'First note.')

/* The loudest headline there is — "nothing written for N days" — gets its N from
   the silence card, not from any row. The model is shown the cards and may repeat
   them; if the checker only looked at the summary it would throw the headline
   away on every night but the one where N happens to be a date in the data. */
const SILENT = { ...SUMMARY, business: { ...SUMMARY.business, entries_last_3_days: 0, last_entry_date: '2026-08-01', days_since_last_entry: 61 } }
const silentCards = skeleton(SILENT)
const silenceCard = silentCards.cards.find((c) => c.label_en === 'Nothing written')
const days = Number(String(silenceCard.value).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).match(/\d+/)[0])
const quiet = { ...good, headline_bn: `${days} দিন কিছু লেখা হয়নি।`, headline_en: `Nothing written for ${days} days.` }
r = check(quiet, { ...SILENT, business: { ...SILENT.business, days_since_last_entry: undefined } }, ids)
ck('the day count on the silence card is refused if the checker cannot see the card', r.headline, 'null')
r = check(quiet, { ...SILENT, business: { ...SILENT.business, days_since_last_entry: undefined } }, ids, { extra: silentCards })
ck('but is a quote, and passes, when the card the model was shown is passed along', r.headline == null, 'false')
r = check({ ...good, headline_bn: '৬১ দিন কিছু লেখা হয়নি।', headline_en: 'Nothing written for 61 days.' }, SILENT, ids)
ck('and the summary now carries the figure itself, so the model can quote it', r.headline == null, 'false')
const wrong = days + 17   // never the card's figure, whatever day the test is run on
r = check({ ...good, headline_bn: `${wrong} দিন কিছু লেখা হয়নি।`, headline_en: `Nothing written for ${wrong} days.` }, SILENT, ids, { extra: silentCards })
ck('a day count that is on neither is still refused', r.headline, 'null')

/* Every dropped piece leaves a reason the model can be shown on a second try. */
r = bad({ headline_bn: 'কাজ ৮০% হয়েছে।', headline_en: 'The work is 80% done.', alerts: [{ severity: 'warn', text_bn: 'বাকি ১২ হাজার', text_en: '12 thousand due' }] })
ck('each drop is logged with its reason', r.dropped.length, 2)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
