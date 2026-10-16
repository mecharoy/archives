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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
