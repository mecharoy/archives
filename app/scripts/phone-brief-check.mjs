/* The phone's nightly job, end to end, in node.

   A small fabricated ledger (in the outbox row format the phone keeps) goes
   through SQLite, the server's summary, the computed cards and the checker.
   By default the model is a stub, so this runs offline in `npm test`:

     node scripts/phone-brief-check.mjs          # offline, stub model
     node scripts/phone-brief-check.mjs --live   # real Gemini, key from
                                                 # %USERPROFILE%\.site-khata\gemini.env
*/

import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import { COLUMNS } from '../server/src/columns.js'
import { makeBrief } from '../nightly/phone-brief.mjs'
import { anonymize, restoreNames } from '../nightly/anonymize.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = process.argv.includes('--live')

let pass = 0, fail = 0
const ck = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log('FAIL ' + name + (detail ? ' : ' + detail : '')) }
}

/* ---------- a ledger ---------- */

const day = (ago) => {
  const d = new Date(Date.now() - ago * 86400000 + 5.5 * 3600000)
  return d.toISOString().slice(0, 10)
}
const now = new Date().toISOString()
const rows = []
let n = 0
const add = (tab, rec, mode = 'append') =>
  rows.push({ tab, mode, values: COLUMNS[tab].map((c) => (rec[c] ?? '')) })
const id = () => 'x' + (++n)

const HOUSE = 'বাড়ি'
const job = { id: 'p1', name_bn: 'রায়বাড়ি', client_bn: 'সুবীর রায়', ptype: HOUSE, area_sqft: 1200, budget: 1500000, start_date: day(40), plan_days: 180, status: 'active', updated_at: now }
add('Projects', job, 'upsert')
const stages = [['ভিত', 20], ['ছাদ', 30], ['দেওয়াল', 25], ['ফিনিশিং', 25]]
stages.forEach(([name_bn, weight], i) => add('Stages', { id: 'st' + i, project_type: HOUSE, seq: i + 1, name_bn, weight, updated_at: now }, 'upsert'))
add('Workers', { id: 'w1', name_bn: 'রহিম শেখ', rate: 700, active: true, updated_at: now }, 'upsert')
add('Workers', { id: 'w2', name_bn: 'গোপাল দাস', rate: 550, active: true, updated_at: now }, 'upsert')
add('Items', { id: 'i1', name_bn: 'সিমেন্ট', unit_bn: 'বস্তা', last_rate: 420, active: true, updated_at: now }, 'upsert')
add('Items', { id: 'i2', name_bn: 'রড', unit_bn: 'কেজি', last_rate: 68, active: true, updated_at: now }, 'upsert')
add('Coefficients', { id: 'c1', project_type: HOUSE, item_id: 'i1', per_sqft: 0.4, updated_at: now }, 'upsert')
add('Coefficients', { id: 'c2', project_type: HOUSE, item_id: 'i2', per_sqft: 3.5, updated_at: now }, 'upsert')
add('Parties', { id: 's1', name_bn: 'শর্মা ট্রেডার্স', ptype: 'supplier', terms_days: 15, updated_at: now }, 'upsert')
add('Bills', { id: 'b1', name_bn: 'দোকান ভাড়া', to_bn: 'নিতাই বাবু', amount: 6500, due_date: day(-3), repeat: 'monthly', personal: false, note: 'নিতাইয়ের ফোন ৯৮৩০...', updated_at: now }, 'upsert')

for (let ago = 12; ago >= 1; ago--) {
  add('Attendance', { id: id(), batch: 'b' + ago, date: day(ago), project_id: 'p1', worker_id: 'w1', presence: 'full', days: 1, rate: 700, amount: 700, advance: 0, created_at: now })
  add('Attendance', { id: id(), batch: 'b' + ago, date: day(ago), project_id: 'p1', worker_id: 'w2', presence: 'full', days: 1, rate: 550, amount: 550, advance: 0, created_at: now })
  if (ago % 3 === 0) add('Money', { id: id(), batch: 'b' + ago, date: day(ago), project_id: 'p1', head_bn: 'চা-জলখাবার', dir: 'paid', amount: 120, mode: 'নগদ', personal: false, created_at: now })
}
add('Stock', { id: id(), batch: 'm1', date: day(30), project_id: 'p1', item_id: 'i1', dir: 'in', qty: 300, rate: 420, amount: 126000, party_id: 's1', due_date: day(15), paid: false, created_at: now })
add('Stock', { id: id(), batch: 'm2', date: day(8), project_id: 'p1', item_id: 'i2', dir: 'in', qty: 2500, rate: 68, amount: 170000, party_id: 's1', due_date: day(-7), paid: false, created_at: now })
add('Progress', { id: id(), batch: 'g1', date: day(20), project_id: 'p1', stage_seq: 1, state: 'done', created_at: now })
add('Money', { id: id(), batch: 'r1', date: day(10), project_id: 'p1', head_bn: 'কাজের টাকা', dir: 'received', amount: 200000, mode: 'ব্যাংক', personal: false, created_at: now })
add('Day', { id: id(), batch: 'd1', date: day(1), project_id: 'p1', cash_counted: 18000, cash_computed: 23500, created_at: now })

/* ---------- the job ---------- */

const SQL = await initSqlJs()
const schemaSql = readFileSync(join(ROOT, 'server/schema.sql'), 'utf8')
const prompt = readFileSync(join(ROOT, 'nightly/prompt.md'), 'utf8')

let key = ''
if (LIVE) {
  const f = join(homedir(), '.site-khata', 'gemini.env')
  if (existsSync(f)) key = (readFileSync(f, 'utf8').match(/GEMINI_API_KEY=(\S+)/) || [])[1] || ''
  if (!key) { console.log('no key in ' + f); process.exit(1) }
}

let sentPrompt = ''
const stub = async (p) => {
  sentPrompt = p
  return {
    model: 'stub',
    json: {
      headline_bn: '[S1]-এর রডের টাকার দিন পেরিয়েছে', headline_en: '[S1] is past the date for the steel',
      project_notes: [{ id: 'p1', status: 'warn', note_bn: '[J1]-এ খরচ কাজের আগে', note_en: 'At [J1] spending is ahead of the work' }],
      alerts: [
        { severity: 'crit', text_bn: 'হাতে ৯৯৯৯৯ টাকা কম', text_en: '99999 short in hand' }, // invented: must be dropped
        { severity: 'warn', text_bn: '[P1]-কে ভাড়া দিতে হবে', text_en: 'Rent is due to [P1]' },
      ],
      todo_bn: ['[S1]-কে ফোন করুন'], todo_en: ['Call [S1]'],
    },
  }
}

const out = await makeBrief({ SQL, schemaSql, rows, prompt, key, ask: LIVE ? undefined : stub })
const { brief, summary, log } = out
for (const l of log) console.log('  · ' + l)

ck('summary built from the rows', summary.projects.length === 1 && summary.projects[0].labour > 0)
ck('wages are the sum of the rows', summary.projects[0].labour === 12 * 1250, String(summary.projects[0].labour))
ck('overdue due found', summary.business.dues_overdue > 0, String(summary.business.dues_overdue))
ck('cards computed', brief.cards.length >= 4)
ck('headline present in both languages', !!brief.headline_bn && !!brief.headline_en)
ck('no label left in the published brief', !/\[[JCWSP]\d+\]/.test(JSON.stringify(brief)), JSON.stringify(brief).match(/\[[JCWSP]\d+\]/)?.[0])

if (!LIVE) {
  ck('names never reach the model', !/রহিম|গোপাল|শর্মা|রায়বাড়ি|সুবীর|নিতাই/.test(sentPrompt))
  ck('bill notes never reach the model', !sentPrompt.includes('৯৮৩০'))
  ck('materials still reach the model', sentPrompt.includes('সিমেন্ট'))
  ck('real names restored', brief.headline_bn.startsWith('শর্মা ট্রেডার্স') && brief.projects[0].note_en.includes('রায়বাড়ি'))
  ck('invented figure dropped', !brief.alerts.some((a) => a.text_en.includes('99999')) && brief.alerts.length === 1)
  ck('a note may sharpen status', brief.projects[0].status !== 'ok')
  const { real } = anonymize({ summary: { projects: [{ id: 'a', name_bn: 'X' }] }, computed: {} })
  ck('restore leaves unknown labels alone', restoreNames('[W9] and [J1]', real) === '[W9] and X')
} else {
  console.log('\n' + JSON.stringify({ headline_en: brief.headline_en, headline_bn: brief.headline_bn, notes: brief.projects.map((p) => [p.status, p.note_en]), alerts: brief.alerts, todo_en: brief.todo_en }, null, 2))
  ck('model answered', !!out.model, 'no model')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
