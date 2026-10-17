/* The small rules behind dues: when a credit sale or purchase falls due, and
   the reminder he sends for money owed to him. Pure functions, no browser. */
process.env.TZ = 'Asia/Kolkata'
import { loadApp, freeze, RealDate } from './_app.mjs'

const app = await loadApp()
const { dues } = app
let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}

ck('the date choices are a week, a fortnight and a month', dues.DUE_CHOICES.map((c) => c.days).join(), '7,15,30')
ck('no agreed days means a week', dues.defaultDueDays(0), 7)
ck("a party's own days are used when it has them", dues.defaultDueDays(15), 15)
ck('a month from 17 October is 16 November', dues.dueFrom('2026-10-17', 30), '2026-11-16')

/* The reminder he sends on WhatsApp. It goes to the customer, so it is Bengali whatever language the
   app itself is shown in. */
const MSG = 'নমস্কার রহিম, ১ সেপ্টেম্বর থেকে ₹১২,৫০০ বাকি আছে। সুবিধামতো দিয়ে দেবেন। — সুবীর'
ck('the reminder reads as the design wrote it', dues.reminderText('রহিম', '2026-09-01', 12500, 'সুবীর'), MSG)
ck('with no name of his own it ends at the request', dues.reminderText('রহিম', '2026-09-01', 12500, ''), 'নমস্কার রহিম, ১ সেপ্টেম্বর থেকে ₹১২,৫০০ বাকি আছে। সুবিধামতো দিয়ে দেবেন।')
app.i18n.setLang('en')
ck('it stays Bengali when the app is in English', dues.reminderText('রহিম', '2026-09-01', 12500, 'সুবীর'), MSG)
app.i18n.setLang('bn')
ck('the WhatsApp link carries the number and the text', dues.reminderHref('98300 12345', MSG), 'https://wa.me/919830012345?text=' + encodeURIComponent(MSG))
ck('no number, no link', dues.reminderHref('', MSG), '')

/* What he is owed, person by person, largest first — what the Monday note and the brief's to-dos read. */
const { calc, remind, bn } = app
const owedRow = (id, party, amount, due) => ({ id, kind: 'stock', batch: 'b' + id, date: '2026-10-01', project_id: '', created_at: '2026-10-01T10:00:00Z', item_id: '', dir: 'opening_get', qty: 0, rate: 0, amount, party_id: party, due_date: due, paid: false, photo_id: '' })
const owed3 = [owedRow('a', 'pA', 3000, '2026-10-25'), owedRow('b', 'pB', 800, '2026-10-20'), owedRow('c', 'pC', 5000, '2026-10-30')]
ck('owed by person, largest first', calc.owedByPerson(owed3).map((x) => x.party_id + ':' + x.amount).join(), 'pC:5000,pA:3000,pB:800')

/* The Monday note: 9 in the morning of the coming Monday, how many people and how much. */
const monday = (entries, when, iso) => { freeze(iso); try { return remind.plan(entries, when).filter((x) => x.extra && x.extra.screen === 'payments') } finally { globalThis.Date = RealDate } }
const two = owed3.slice(0, 2)
const fri = monday(two, 'day', '2026-10-16T04:30:00Z')   // Friday 10 am in Kolkata
ck('on a Friday there is one Monday note', fri.length, 1)
ck('it is for Monday the 19th', fri[0] && bn.isoDate(fri[0].at), '2026-10-19')
ck('at 9 in the morning', fri[0] && fri[0].at.getHours() + ':' + fri[0].at.getMinutes(), '9:0')
ck('it says how many people owe and how much', fri[0] && fri[0].body, '২ জনের কাছে ₹৩,৮০০ পাওনা')
ck('a Monday before 9 gets it the same morning', bn.isoDate(monday(two, 'day', '2026-10-19T02:00:00Z')[0].at), '2026-10-19')
ck('a Monday after 9 gets it the next Monday', bn.isoDate(monday(two, 'day', '2026-10-19T05:00:00Z')[0].at), '2026-10-26')
ck('nothing owed, no note', monday([], 'day', '2026-10-16T04:30:00Z').length, 0)
ck('reminders off, no note', monday(two, 'off', '2026-10-16T04:30:00Z').length, 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
