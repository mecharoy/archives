/* The small rules behind dues: when a credit sale or purchase falls due, and
   the reminder he sends for money owed to him. Pure functions, no browser. */
import { loadApp } from './_app.mjs'

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
