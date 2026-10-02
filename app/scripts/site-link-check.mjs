/* The link between the website and the app, through the Worker's real handler.

   No network and no wrangler: the Worker's own `fetch` is called with a
   database built from schema.sql in sql.js, the same way the app's brief is
   tested. What is being guarded:

     - the website can read what is in stock, as names and yes/no, and NOTHING
       else — no quantities, no prices, no ids — and only with its own token,
       which is neither the phone's nor the admin's;
     - a good the shop has not handled, or has hidden, or has switched off, is
       not listed; a sold-out one is listed as out of stock;
     - a sale that reaches the server flips the answer on the very next read;
     - an enquiry posted by the website is validated, stored once even if it is
       posted twice, and readable by the phone with its device token;
     - with no SITE_TOKEN set the website routes are simply off.

   `npm run sitelink:check`, and it is part of `npm test`. */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import worker from '../server/src/index.js'
import { COLUMNS } from '../server/src/columns.js'
import { ITEM_EN } from '../server/src/catalog-en.js'
import { d1 } from '../nightly/ledger-sql.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}

const SQL = await initSqlJs()
const schema = readFileSync(join(ROOT, 'server/schema.sql'), 'utf8')
const fresh = () => { const raw = new SQL.Database(); raw.exec(schema); return raw }

const ADMIN = 'admin-test-token-0123456789abcdef'
const SITE = 'site-test-token-0123456789abcdef'
const RESET = 'reset-code-for-the-test'

const call = async (env, method, path, { token, body } = {}) => {
  const res = await worker.fetch(new Request('http://worker.test' + path, {
    method,
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), env)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text }
}

const row = (tab, rec, mode = 'append') => ({ id: 'o' + Math.random().toString(36).slice(2, 10), tab, mode, values: COLUMNS[tab].map((c) => (rec[c] ?? '')) })
let n = 0
const stock = (o) => row('Stock', { id: 'st' + ++n, batch: 'b' + n, date: '2026-09-01', project_id: '', party_id: '', due_date: '', paid: true, photo_id: '', created_at: '2026-09-01T10:00:' + String(n % 60).padStart(2, '0'), amount: (o.qty || 0) * (o.rate || 0), ...o })
const item = (id, name_bn, extra = {}) => row('Items', { id, name_bn, unit_bn: 'পিস', last_rate: 50, active: true, updated_at: 't', ...extra }, 'upsert')

/* ---------- a shop ---------- */

const raw = fresh()
const env = { DB: d1(raw), ADMIN_TOKEN: ADMIN, SITE_TOKEN: SITE, RESET_CODE: RESET }

const made = await call(env, 'POST', '/admin/households', { token: ADMIN, body: { name: 'Test shop' } })
const DEV = made.json.device_token
const HID = made.json.household.id
const send = (rows) => call(env, 'POST', '/rows', { body: { token: DEV, rows } })

const [pvc, pvcInfo] = Object.entries(ITEM_EN)[0]      // a catalogue good, so it has an English name
const slip = stock({ item_id: 'i6', dir: 'in', qty: 3, rate: 10 })

const posted = await send([
  item('i1', pvc),                                          // in stock
  item('i2', 'আমার নিজের মাল'),                              // sold out; not in the catalogue
  item('i3', 'লুকানো মাল', { web_hidden: true }),            // he hid it from the website
  item('i4', 'বন্ধ মাল', { active: false }),                 // switched off
  item('i5', 'সাইটের মাল'),                                  // bought straight for a site
  item('i6', 'ভুল কেনা মাল'),                                // bought by mistake, then cancelled
  item('i8', 'গোনা মাল'),                                    // counted
  item('i9', 'কখনও ছোঁয়া হয়নি'),                            // never touched
  stock({ item_id: 'i1', dir: 'in', qty: 20, rate: 40 }),
  stock({ item_id: 'i1', dir: 'sale', qty: 5, rate: 60 }),
  stock({ item_id: 'i2', dir: 'in', qty: 10, rate: 40 }),
  stock({ item_id: 'i2', dir: 'sale', qty: 10, rate: 60 }),
  stock({ item_id: 'i3', dir: 'in', qty: 5, rate: 40 }),
  stock({ item_id: 'i4', dir: 'in', qty: 5, rate: 40 }),
  stock({ item_id: 'i5', dir: 'in', qty: 5, rate: 40, project_id: 'p1' }),
  slip,
  stock({ item_id: 'i6', dir: 'in', qty: -3, rate: 10, reverses: slip.values[0], amount: -30 }),
  stock({ item_id: 'i8', dir: 'count', qty: 0, rate: 10, date: '2026-09-01' }),
])
ck('the phone could send its rows', posted.json.accepted.length, posted.json.accepted.length + posted.json.rejected.length)
ck('and none was refused', posted.json.rejected.length, 0)

// A phone built before the "show on website" switch sends six values, not seven.
const old = { id: 'oldapk1', tab: 'Items', mode: 'upsert', values: ['i7', 'পুরোনো ফোনের মাল', 'পিস', 40, true, 't'] }
await send([old, stock({ item_id: 'i7', dir: 'in', qty: 4, rate: 40 })])

/* ---------- who may ask ---------- */

let r = await call(env, 'GET', '/public/inventory')
ck('no token, no inventory', r.status, 401)
r = await call(env, 'GET', '/public/inventory', { token: DEV })
ck("the phone's own token is not the website's", r.status, 401)
r = await call(env, 'GET', '/public/inventory', { token: ADMIN })
ck("nor is the admin's — the site's token is its own", r.status, 401)
r = await call(env, 'GET', '/public/inventory', { token: 'x' })
ck('a wrong token is refused', r.status, 401)
r = await call({ ...env, SITE_TOKEN: '' }, 'GET', '/public/inventory', { token: '' })
ck('with no site token configured the route is off, even for an empty one', r.status, 401)

/* ---------- what it says ---------- */

r = await call(env, 'GET', '/public/inventory', { token: SITE })
ck('the website can read the inventory', r.status, 200)
const list = r.json.items
const by = (name) => list.find((x) => x.name_bn === name)

ck('a good in stock is listed', by(pvc) && by(pvc).available, true)
ck('with its English name from the catalogue', by(pvc) && by(pvc).name_en, pvcInfo.en)
ck('and its section', by(pvc) && by(pvc).category_en, 'Pipes')
ck('a good sold down to nothing is listed as out of stock', by('আমার নিজের মাল') && by('আমার নিজের মাল').available, false)
ck('a good that is not in the catalogue is named the same in English', by('আমার নিজের মাল') && by('আমার নিজের মাল').name_en, 'আমার নিজের মাল')
ck('and filed under Other', by('আমার নিজের মাল') && by('আমার নিজের মাল').category_en, 'Other')
ck('a good he hid from the website is not listed', by('লুকানো মাল'), undefined)
ck('a good switched off is not listed', by('বন্ধ মাল'), undefined)
ck('a good bought straight for a site is not listed', by('সাইটের মাল'), undefined)
ck('a purchase that was cancelled leaves nothing listed', by('ভুল কেনা মাল'), undefined)
ck('a good the shop never touched is not listed', by('কখনও ছোঁয়া হয়নি'), undefined)
ck('a counted zero is out of stock', by('গোনা মাল') && by('গোনা মাল').available, false)
ck('a good from a phone with no switch yet is listed', by('পুরোনো ফোনের মাল') && by('পুরোনো ফোনের মাল').available, true)
ck('the catalogue section comes before "other"', list.findIndex((x) => x.category_en === 'Pipes') < list.findIndex((x) => x.category_en === 'Other'), true)

/* The one thing the website must never be able to learn. */
const KEYS = ['available', 'category_bn', 'category_en', 'name_bn', 'name_en']
ck('each good is exactly name, section and yes/no', list.every((x) => Object.keys(x).sort().join() === KEYS.join()), true)
ck('the answer carries only the list and when it was last true', Object.keys(r.json).sort().join(), 'items,ok,updated_at')
ck('no quantity, price or id is anywhere in it', /qty|quantity|rate|price|amount|"id"|supplier|party|cost/i.test(r.text), false)
ck('and not one of the numbers he typed (20, 5, 40, 60) appears', /[^0-9](20|40|60)[^0-9]/.test(r.text.replace(/[০-৯]/g, '')), false)
ck('when it was last told is an ISO time', Number.isFinite(Date.parse(r.json.updated_at)), true)

/* ---------- a sale reaches the website on the next read ---------- */

await send([stock({ item_id: 'i1', dir: 'sale', qty: 15, rate: 60, date: '2026-09-02' })])
r = await call(env, 'GET', '/public/inventory', { token: SITE })
ck('selling the last of a good flips it to out of stock', r.json.items.find((x) => x.name_bn === pvc).available, false)
await send([stock({ item_id: 'i1', dir: 'in', qty: 30, rate: 40, date: '2026-09-03' })])
r = await call(env, 'GET', '/public/inventory', { token: SITE })
ck('and a delivery flips it back', r.json.items.find((x) => x.name_bn === pvc).available, true)
await send([item('i3', 'লুকানো মাল', { web_hidden: false })])
r = await call(env, 'GET', '/public/inventory', { token: SITE })
ck('un-hiding a good puts it on the list', Boolean(r.json.items.find((x) => x.name_bn === 'লুকানো মাল')), true)
await send([item('i1', pvc, { web_hidden: true })])
r = await call(env, 'GET', '/public/inventory', { token: SITE })
ck('hiding one takes it off', r.json.items.find((x) => x.name_bn === pvc), undefined)

/* ---------- more than one household ---------- */

const second = await call(env, 'POST', '/admin/households', { token: ADMIN, body: { name: 'Another' } })
r = await call(env, 'GET', '/public/inventory', { token: SITE })
ck('two households and no SITE_HOUSEHOLD: the website is not told which, so nothing is guessed', r.status, 404)
r = await call({ ...env, SITE_HOUSEHOLD: HID }, 'GET', '/public/inventory', { token: SITE })
ck('naming the household settles it', r.status, 200)
r = await call({ ...env, SITE_HOUSEHOLD: 'h_nonexistent' }, 'GET', '/public/inventory', { token: SITE })
ck('naming one that does not exist is refused', r.status, 404)

/* ---------- enquiries ---------- */

const ENV2 = { ...env, SITE_HOUSEHOLD: HID }
const good = { id: 'enq-0001-abcdef', name: 'Mitali Das', phone: '+91 87942 55183', email: 'm@example.com', location: 'Agartala', service: 'plumbing', message: 'Need a quote for a bathroom.', locale: 'en' }

r = await call(ENV2, 'POST', '/enquiries', { body: good })
ck('an enquiry with no token is refused', r.status, 401)
r = await call(ENV2, 'POST', '/enquiries', { token: DEV, body: good })
ck("an enquiry with the phone's token is refused", r.status, 401)
r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: good })
ck('the website can post one', r.status, 200)
ck('and is given its id back', r.json.id, good.id)
r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: good })
ck('posting it again (a retry after a timeout) is accepted', r.status, 200)

r = await call(ENV2, 'GET', '/enquiries', { token: DEV })
ck('the phone can read them', r.status, 200)
ck('stored once, not twice', r.json.enquiries.length, 1)
ck('with the name', r.json.enquiries[0].name, good.name)
ck('the phone number', r.json.enquiries[0].phone, good.phone)
ck('the message', r.json.enquiries[0].message, good.message)
ck('the service', r.json.enquiries[0].service, 'plumbing')
ck('and when it arrived', Number.isFinite(Date.parse(r.json.enquiries[0].received_at)), true)
r = await call(ENV2, 'GET', '/enquiries', { token: 'nope-nope-nope-nope-nope' })
ck('a stranger cannot read them', r.status, 401)
r = await call(ENV2, 'GET', '/enquiries', { token: SITE })
ck("and the website's own token cannot read them back", r.status, 401)

r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: { ...good, id: 'enq-0002-abcdef', phone: 'call me' } })
ck('a phone number that is not one is refused', r.status, 400)
r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: { ...good, id: 'enq-0003-abcdef', name: '   ' } })
ck('a blank name is refused', r.status, 400)
r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: 'not json' })
ck('something that is not JSON is refused', r.status, 400)
r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: { ...good, message: 'x'.repeat(20000) } })
ck('an oversized one is refused', r.status, 413)

r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: { ...good, id: 'enq-0004-abcdef', message: 'y'.repeat(9000), name: 'N'.repeat(500) } })
ck('a long one that fits is accepted', r.status, 200)
r = await call(ENV2, 'GET', '/enquiries', { token: DEV })
const long = r.json.enquiries.find((e) => e.id === 'enq-0004-abcdef')
ck('and trimmed to what the app can show', long.message.length, 4000)
ck('names are trimmed too', long.name.length, 120)

r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: { name: 'No Id', phone: '9876543210' } })
ck('an enquiry with no id of its own is given one', /^q_/.test(r.json.id), true)
r = await call(ENV2, 'POST', '/enquiries', { token: SITE, body: { ...good, id: "x'); DROP TABLE enquiries;--", message: "'; DROP TABLE items;--" } })
ck('SQL in a field is only text', r.status, 200)
r = await call(ENV2, 'GET', '/enquiries', { token: DEV })
ck('and the table is still there', r.status, 200)
ck('newest first', r.json.enquiries[0].received_at >= r.json.enquiries[r.json.enquiries.length - 1].received_at, true)

/* One household cannot read another's. */
const other = second.json.device_token
r = await call(ENV2, 'GET', '/enquiries', { token: other })
ck("another household's phone sees none of them", r.json.enquiries.length, 0)

/* ---------- erasing everything erases these too ---------- */

r = await call(ENV2, 'POST', '/wipe', { body: { token: DEV, code: RESET } })
ck('a wipe with the code works', r.json.ok, true)
r = await call(ENV2, 'GET', '/enquiries', { token: DEV })
ck('and takes the enquiries with it', r.json.enquiries.length, 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
