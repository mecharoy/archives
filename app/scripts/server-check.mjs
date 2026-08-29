/* The server's own arithmetic, checked without jq or bash — so it runs on the
   machine the APK is actually built on.

   `npm run server:dev` first, then `npm run server:check`. It creates its own
   household, so it never touches his.

   What it is really guarding: the dashboard and the phone must answer "what
   does he owe" with the same number. The netting rule lives twice, once in
   src/lib/calc.ts and once in server/src/summary.js, and this is the test that
   notices when they drift apart. */

const B = process.env.SITE_KHATA_BASE || 'http://localhost:8799'
const A = process.env.SITE_KHATA_ADMIN || 'dev-admin-token-for-local-testing-only'

let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}
const post = (path, body, token) => fetch(B + path, {
  method: 'POST',
  headers: token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))

const health = await fetch(B + '/health').then((r) => r.json()).catch(() => null)
if (!health?.ok) {
  console.log('The local Worker is not up, or this shell cannot reach it.')
  console.log('Run `npm run server:dev` in another terminal, then `npm run server:check`.')
  console.log('Point it elsewhere with SITE_KHATA_BASE and SITE_KHATA_ADMIN.')
  process.exit(1)
}

const made = await post('/admin/households', { name: 'Check ' + Date.now() }, A)
ck('household created', made.json.ok, 'true')
const hid = made.json.household.id
const dev = made.json.device_token

const now = new Date().toISOString()
const today = now.slice(0, 10)
const shift = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)
const yesterday = shift(-1)
const soon = shift(3)
const row = (tab, values) => ({ id: 'r' + Math.random().toString(36).slice(2), tab, mode: 'append', values })

/* A bill for ₹4,000 due today, half of it paid off. */
const rows = [
  row('Parties', ['p1', 'শর্মা ট্রেডার্স', 'supplier', 7, '', now]),
  row('Items', ['i1', 'সিমেন্ট', 'বস্তা', 400, true, now]),
  row('Stock', ['s1', 'b1', today, '', 'i1', 'in', 10, 400, 4000, 'p1', today, false, '', '', now]),
  row('Money', ['m1', 'b2', today, '', 'বাকি মেটানো', 'paid', 1500, 'p1', 'নগদ', '', false, '', '', now]),
  /* And a credit sale of ₹2,500, nothing collected yet. */
  row('Parties', ['p2', 'হালদার বাবু', 'client', 0, '', now]),
  row('Stock', ['s2', 'b3', today, '', 'i1', 'sale', 5, 500, 2500, 'p2', today, false, '', '', now]),

  /* A week with something in every breakdown: a man on site, a site expense,
     a household expense, and a date he set for himself. */
  row('Workers', ['w1', 'রতন মিস্ত্রি', 600, '', true, now]),
  row('Day', ['d1', 'b4', today, '', 3000, 3000, '', '', now]),
  row('Attendance', ['a1', 'b4', today, '', 'w1', 'full', 1, 600, 600, 100, '', now]),
  row('Money', ['m2', 'b4', today, '', 'গাড়ি ভাড়া', 'paid', 800, '', 'নগদ', '', false, '', '', now]),
  row('Money', ['m3', 'b4', today, '', 'বাজার', 'paid', 1200, '', 'নগদ', '', true, '', '', now]),
  row('Money', ['m4', 'b4', today, '', 'ব্যবসা থেকে নেওয়া', 'paid', 5000, '', 'নগদ', '', true, '', '', now]),
  row('Bills', ['bl1', 'ঘরভাড়া', 'বাড়িওয়ালা', 4000, yesterday, 'monthly', true, '', '', now]),
  row('Bills', ['bl2', 'ইস্কুলের মাইনে', '', 2000, soon, 'monthly', true, '', '', now]),
]
const sent = await post('/rows', { token: dev, rows })
ck('rows accepted', sent.json.ok, 'true')
ck('every row stored', sent.json.accepted.length, rows.length)

const sum = await fetch(B + '/summary?household=' + hid, { headers: { Authorization: 'Bearer ' + A } }).then((r) => r.json())
const b = sum.business
ck('a ₹1,500 payment nets off the ₹4,000 bill', b.dues_total, 2500)
ck('the credit sale shows as receivable', b.receivable_total, 2500)

/* The wipe: refused without the code, and it must not have deleted anything. */
const bad = await post('/wipe', { token: dev, code: '000000' })
ck('wipe refuses a wrong code', bad.status, 403)
const after = await fetch(B + '/summary?household=' + hid, { headers: { Authorization: 'Bearer ' + A } }).then((r) => r.json())
ck('a refused wipe deleted nothing', after.business.dues_total, 2500)

/* ---- the week, and the four breakdowns the dashboard reads ---- */

ck('the period is a week', sum.period.unit, 'week')
ck('and it is seven days long', Math.round((Date.parse(sum.period.to) - Date.parse(sum.period.from)) / 86400000), 6)
ck('the week counts wages', b.wages_this_week, 600)
ck('the week counts material', b.material_this_week, 4000)
ck('the week counts site expenses', b.other_this_week, 800)
ck('and settling a bill is still not spending', b.spend_this_week, 5400)
ck('a day entered shows in the week', b.days_entered_this_week, 1)

const bd = sum.breakdown
ck('the expense head is broken out', bd.heads[0].head_bn, 'গাড়ি ভাড়া')
ck('with its amount', bd.heads[0].week, 800)
ck('the household head is NOT in the site breakdown', bd.heads.some((h) => h.head_bn === 'বাজার'), 'false')
ck('the shop is broken out', bd.suppliers[0].name_bn, 'শর্মা ট্রেডার্স')
ck('showing what is still unpaid to it', bd.suppliers[0].unpaid, 4000)
ck('the man is broken out', bd.workers[0].name_bn, 'রতন মিস্ত্রি')
ck('with his days and his advance', bd.workers[0].days_week + '/' + bd.workers[0].advance_week, '1/100')
ck('the material is broken out', bd.items[0].name_bn, 'সিমেন্ট')
ck('in his own unit', bd.items[0].unit_bn, 'বস্তা')

/* ---- his own book, kept apart ---- */

ck('household spending is counted', sum.personal.spent_this_week, 1200)
ck('money taken from the business is not called household spending', sum.personal.spent_last_28_days, 1200)
ck('it is reported on its own', sum.personal.drawn_this_week, 5000)
ck('and broken down by head', sum.personal.heads[0].head_bn, 'বাজার')

/* ---- dates he set for himself ---- */

ck('an overdue date of his own is flagged', sum.bills.personal.overdue, 4000)
ck('one falling due inside the week is separate', sum.bills.personal.this_week, 2000)
ck('both are counted', sum.bills.personal.count, 2)
ck('the overdue one says how late', sum.bills.list[0].days_away, -1)
ck('a business date is kept apart', sum.bills.business.total, 0)

/* ---- enough context to know whether any of this can be trusted ---- */

ck('the ledger size is reported', sum.coverage.days_recorded, 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
