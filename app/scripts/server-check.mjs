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
]
const sent = await post('/rows', { token: dev, rows })
ck('rows accepted', sent.json.ok, 'true')
ck('every row stored', sent.json.accepted.length, rows.length)

const sum = await fetch(B + '/summary?household=' + hid, { headers: { Authorization: 'Bearer ' + A } }).then((r) => r.json())
const b = sum.business
ck('a ₹1,500 payment nets off the ₹4,000 bill', b.dues_total, 2500)
ck('the credit sale shows as receivable', b.receivable_total, 2500)
ck('settling a bill is not counted as spending', b.spend_this_month, 4000)

/* The wipe: refused without the code, and it must not have deleted anything. */
const bad = await post('/wipe', { token: dev, code: '000000' })
ck('wipe refuses a wrong code', bad.status, 403)
const after = await fetch(B + '/summary?household=' + hid, { headers: { Authorization: 'Bearer ' + A } }).then((r) => r.json())
ck('a refused wipe deleted nothing', after.business.dues_total, 2500)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
