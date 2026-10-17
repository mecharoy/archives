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

/* The 8 pm nudge: once setup is done, at 8 in the evening on every day with nothing written — whatever
   the payment-reminder setting. Saving today's day drops today's nudge. */
const dayRow = (date) => ({ id: 'd' + date, kind: 'day', batch: 'bd' + date, date, project_id: '', created_at: date + 'T14:00:00Z', cash_counted: null, cash_computed: null, note: '' })
const nudges = (entries, when, iso, onboarded = true) => {
  freeze(iso)
  try { return remind.plan(entries, when, 9, [], onboarded).filter((x) => x.extra && x.extra.screen === 'home') } finally { globalThis.Date = RealDate }
}
const n1 = nudges([], 'day', '2026-10-16T04:30:00Z')
ck('nothing written today: a nudge tonight and on each of the next six evenings', n1.length, 7)
ck('the first is tonight at 8', n1[0] && bn.isoDate(n1[0].at) + ' ' + n1[0].at.getHours(), '2026-10-16 20')
ck('it says the day is not written yet', n1[0] && n1[0].body, 'আজকের হিসাব লেখা বাকি')
ck("today written: tonight's nudge is gone", bn.isoDate(nudges([dayRow('2026-10-16')], 'day', '2026-10-16T04:30:00Z')[0].at), '2026-10-17')
ck('after 8 pm the first is tomorrow', bn.isoDate(nudges([], 'day', '2026-10-16T15:30:00Z')[0].at), '2026-10-17')
ck('before setup is done, no nudge', nudges([], 'day', '2026-10-16T04:30:00Z', false).length, 0)
ck('payment reminders off: the nudges stay', nudges(two, 'off', '2026-10-16T04:30:00Z').length, 7)
ck('payment reminders off: no Monday note', monday(two, 'off', '2026-10-16T04:30:00Z').length, 0)

/* When the phone writes its brief: after 6 pm, once today's day is saved; again whenever the day is saved
   after the last brief; a missed evening is caught up the next morning; a refused key or a try in the last
   half hour waits. Times below are UTC; Kolkata is 5½ hours ahead. */
const { briefDue } = app
const due = (o) => briefDue.briefDue({ hasKey: true, badKey: false, triedAt: '', doneDay: '2026-10-15', madeAt: '2026-10-15T14:00:00Z', dayRowAt: '', ...o, now: new RealDate(o.now) })
ck('5 pm with the day saved: not yet', due({ now: '2026-10-16T11:30:00Z', dayRowAt: '2026-10-16T11:00:00Z' }), false)
ck('7 pm with no day saved today: not yet', due({ now: '2026-10-16T13:30:00Z', dayRowAt: '2026-10-15T14:00:00Z' }), false)
ck('7 pm, the day saved, no brief today: now', due({ now: '2026-10-16T13:30:00Z', dayRowAt: '2026-10-16T13:20:00Z' }), true)
ck('the day saved again after the brief: again', due({ now: '2026-10-16T14:05:00Z', doneDay: '2026-10-16', madeAt: '2026-10-16T13:35:00Z', dayRowAt: '2026-10-16T14:00:00Z' }), true)
ck('the brief already covers the day: no', due({ now: '2026-10-16T14:05:00Z', doneDay: '2026-10-16', madeAt: '2026-10-16T13:35:00Z', dayRowAt: '2026-10-16T13:20:00Z' }), false)
ck('next morning after a missed evening: now', due({ now: '2026-10-17T02:30:00Z', doneDay: '2026-10-15' }), true)
ck('next morning after a brief last night: no', due({ now: '2026-10-17T02:30:00Z', doneDay: '2026-10-16' }), false)
ck('tried ten minutes ago: wait', due({ now: '2026-10-16T13:30:00Z', dayRowAt: '2026-10-16T13:20:00Z', triedAt: '2026-10-16T13:20:00Z' }), false)
ck('a key Google refused: wait for a new one', due({ now: '2026-10-16T13:30:00Z', dayRowAt: '2026-10-16T13:20:00Z', badKey: true }), false)
ck('no key: never', due({ now: '2026-10-16T13:30:00Z', dayRowAt: '2026-10-16T13:20:00Z', hasKey: false }), false)

/* A job set up mid-way: the stages before the one it is at are done, and what came in so far is the
   job's income without being today's cash. */
const { jobstart } = app
const st4 = [1, 2, 3, 4].map((seq) => ({ seq }))
const rows = jobstart.jobStartRows('p9', st4, 3, 200000, '2026-10-17')
const prog = rows.filter((e) => e.kind === 'progress')
ck('a job at stage 3 has stages 1 and 2 done', prog.map((e) => e.stage_seq + e.state).join(), '1done,2done')
ck('all on the job, in one batch', new Set(rows.map((e) => e.batch)).size + ':' + rows.every((e) => e.project_id === 'p9'), '1:true')
const recv = rows.filter((e) => e.kind === 'money')
ck('what came in so far is one received row for the job', recv.map((e) => [e.dir, e.amount, e.head_bn].join('/')).join(), 'received/200000/কাজের টাকা')
ck('marked as received earlier, so it is not counted as cash', recv[0] && recv[0].mode, calc.EARLIER_MODE)
ck('cash is untouched by it', calc.cashState(rows, 10000, '2026-10-01').computed, 10000)
ck('at the first stage nothing is done', jobstart.jobStartRows('p9', st4, 1, 0, '2026-10-17').length, 0)

/* A number picked from the phone book that is already on a person is that person, however it is
   written: a second record splits one man's dues in two. */
{
  const { phone } = app
  const people = [{ id: 'a', phone: '98300 12345' }, { id: 'b', phone: '' }, { id: 'c', phone: '+91 90000-11111' }]
  ck('the same number written another way finds the same person', phone.findByPhone(people, '+919830012345')?.id, 'a')
  ck('with a leading 0', phone.findByPhone(people, '090000 11111')?.id, 'c')
  ck('a new number finds nobody', phone.findByPhone(people, '91234 56789'), undefined)
  ck('an empty number finds nobody, not the person with no number', phone.findByPhone(people, ''), undefined)
}

/* Plainer words (design D5). What is stored never changes; only what is shown. */
ck('UPI is shown as online', calc.modeLabel('UPI'), 'অনলাইনে (UPI)')
ck('received-earlier is shown as it is', calc.modeLabel('আগে পাওয়া'), 'আগে পাওয়া')
ck('cash is shown as it is', calc.modeLabel('নগদ'), 'নগদ')
{
  const { readdirSync, readFileSync, statSync } = await import('fs')
  const { join } = await import('path')
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  const files = walk(join(app.ROOT, 'src')).filter((f) => f.endsWith('.tsx'))
  const holding = (re) => files.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.split(/[\\/]/).pop()).join()
  ck('no button says সেভ করুন', holding(/['"]সেভ করুন['"]|['"]সেভ হচ্ছে…['"]/), '')
  ck('nothing says মাইনাসে', holding(/মাইনাসে/), '')
  ck('the expense list says খরচের ধরন, not খাত', holding(/সব খরচের খাত/), '')
  ck("home no longer labels the brief 'ফোনের নিজের হিসাব'", holding(/t\('ফোনের নিজের হিসাব'\)/), '')
  ck('the evening drops the sentence about stage weights', files.filter((f) => f.endsWith('DayWizard.tsx') && /ধাপের ওজন/.test(readFileSync(f, 'utf8'))).length, 0)
  ck('every payment-mode chip shows its label, not the stored value', holding(/PAY_MODES\.map\([^\n]*>\{m\}<\/Chip>/), '')
}

/* Hints name the place a thing really is. Stages and thumb rules live in কাজ → কাজের ধাপ ও থাম্ব রুল
   now; a hint sending him to "সেটিংস → ধাপ" sends him to a page that no longer has them. */
{
  const { readdirSync, readFileSync, statSync } = await import('fs')
  const { join } = await import('path')
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  const stale = walk(join(app.ROOT, 'src')).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('en.ts') && readFileSync(f, 'utf8').includes('সেটিংস → ধাপ'))
  ck('no hint points at সেটিংস → ধাপ', stale.map((f) => f.split(/[\\/]/).pop()).join(), '')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
