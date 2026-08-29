/* The nightly run.

   Fetch his figures, work out every number here, ask Claude for the sentences
   that go around them, check what comes back, publish. On his phone by the
   time he wakes.

   It authenticates with the Claude Code subscription already signed in on this
   machine — `claude -p` is the same login as the terminal, so there is no API
   key anywhere in this folder and nothing to top up.

   Config lives OUTSIDE this repository, because the repository is public:
       %USERPROFILE%\.site-khata\nightly.json
       { "endpoint": "https://….workers.dev", "admin_token": "…",
         "household": "h_…", "model": "opus" }
   Only `endpoint` and `admin_token` are required; the household is discovered
   when there is exactly one, and the model defaults to opus.

   Run it by hand any time:   node nightly/run.mjs
   See what it would publish:  node nightly/run.mjs --dry
*/

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { skeleton, plainHeadline } from './compute.mjs'
import { check } from './check.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOME = join(homedir(), '.site-khata')
const CONFIG = join(HOME, 'nightly.json')
const LOG = join(HOME, 'nightly.log')
const DRY = process.argv.includes('--dry')

/* Timestamps are Kolkata's, always — the machine may be set to anything, and
   a brief stamped in the wrong zone reads as stale on his phone. */
function nowIST() {
  const d = new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000)
  const p = (x, w = 2) => String(x).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}+05:30`
}

function say(line) {
  const stamp = nowIST()
  console.log(line)
  try {
    if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true })
    appendFileSync(LOG, `${stamp}  ${line}\n`)
  } catch { /* a log that cannot be written must not stop the brief */ }
}

function die(line) { say('FAILED  ' + line); process.exit(1) }

/* ---------------------------------------------------------- config */

if (!existsSync(CONFIG)) {
  die(`no config at ${CONFIG}. Create it with:\n` +
    `  { "endpoint": "https://site-khata.<you>.workers.dev", "admin_token": "<the admin token>" }`)
}
let cfg
try { cfg = JSON.parse(readFileSync(CONFIG, 'utf8')) } catch (e) { die(`config is not valid JSON: ${e.message}`) }
if (!cfg.endpoint || !cfg.admin_token) die('config needs both endpoint and admin_token')
const BASE = String(cfg.endpoint).replace(/\/+$/, '')
const AUTH = { Authorization: 'Bearer ' + cfg.admin_token }
const MODEL = cfg.model || 'opus'

async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...AUTH, ...(init.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 160)}`)
  try { return JSON.parse(text) } catch { throw new Error(`${path} did not return JSON`) }
}

/* ---------------------------------------------------------- 1. figures */

let household = cfg.household
if (!household) {
  const list = await api('/admin/households').catch((e) => die(e.message))
  const rows = list.households || []
  if (rows.length !== 1) die(`${rows.length} households on the server — put the right id in ${CONFIG}`)
  household = rows[0].id
  say(`household discovered: ${household}`)
}

const summary = await api('/summary?household=' + encodeURIComponent(household)).catch((e) => die(e.message))
const b = summary.business
say(`figures in: ${summary.projects.length} jobs, ${b.entries_last_3_days} entries in 3 days, ` +
  `dues ${b.dues_total}, receivable ${b.receivable_total}`)

/* ---------------------------------------------------------- 2. the numbers */

const base = skeleton(summary)
const ids = new Set(base.projects.map((p) => p.id))

/* ---------------------------------------------------------- 3. the words */

/* The model is handed the raw figures AND what has already been computed from
   them, so it never has to work anything out to write a sentence. */
const payload = {
  today: nowIST().slice(0, 10),
  summary,
  computed: { cards: base.cards, projects: base.projects, burn: base.series.burn },
}

function askClaude() {
  const prompt = readFileSync(join(HERE, 'prompt.md'), 'utf8') +
    '\n\n---\n\nDATA:\n\n```json\n' + JSON.stringify(payload, null, 1) + '\n```\n'
  const out = execFileSync('claude', [
    '-p',
    '--restricted',            // no shell, no files — this job is only text
    '--output-format', 'json',
    '--model', MODEL,
  ], {
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 8 * 60 * 1000,
    windowsHide: true,
  })
  const envelope = JSON.parse(out)
  const text = String(envelope.result ?? '')
  // A fence or a stray sentence around the object is common and harmless.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply')
  return JSON.parse(text.slice(start, end + 1))
}

let written = null
for (let attempt = 1; attempt <= 2 && !written; attempt++) {
  try {
    written = askClaude()
    say(`Claude answered on attempt ${attempt}`)
  } catch (e) {
    say(`attempt ${attempt} failed: ${String(e.message).slice(0, 200)}`)
  }
}

/* ---------------------------------------------------------- 4. checking */

let words = { headline: null, notes: new Map(), alerts: [], todo_bn: [], todo_en: [], dropped: [] }
if (written) {
  words = check(written, summary, ids)
  for (const d of words.dropped) say('dropped — ' + d)
}
if (!words.headline) {
  const p = plainHeadline(summary)
  words.headline = p
  say('using the plain headline: ' + p.en)
}

/* ---------------------------------------------------------- 5. assembly */

/* A note may sharpen a job's status but never soften it. */
const RANK = { ok: 0, info: 0, warn: 1, crit: 2 }
const worse = (a, c) => (c && (RANK[c] || 0) > (RANK[a] || 0) ? c : a)

const brief = {
  generated_at: nowIST(),
  headline_bn: words.headline.bn,
  headline_en: words.headline.en,
  cards: base.cards,
  projects: base.projects.map((p) => {
    const note = words.notes.get(p.id)
    return {
      name_bn: p.name_bn,
      name_en: p.name_en,
      pct_done: p.pct_done,
      pct_spent: p.pct_spent,
      // A note may sharpen the status but never soften it: the arithmetic
      // decides whether a job is in trouble, not the sentence about it.
      status: worse(p.status, note && note.status),
      note_bn: note ? note.note_bn : '',
      note_en: note ? note.note_en : '',
    }
  }),
  alerts: words.alerts,
  series: base.series,
  todo_bn: words.todo_bn,
  todo_en: words.todo_en,
}


/* ---------------------------------------------------------- 6. publish */

if (DRY) {
  console.log(JSON.stringify(brief, null, 2))
  say('dry run — nothing published')
  process.exit(0)
}

const res = await fetch(`${BASE}/brief?household=${encodeURIComponent(household)}`, {
  method: 'PUT',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify(brief),
})
const body = await res.text()
if (!res.ok) die(`publish -> ${res.status} ${body.slice(0, 200)}`)

say(`published: "${brief.headline_en}" · ${brief.cards.length} cards · ` +
  `${brief.alerts.length} alerts · ${brief.todo_bn.length} to-dos` +
  (words.dropped.length ? ` · ${words.dropped.length} dropped` : ''))

/* Keep the last copy on disk. When something looks wrong on his phone in the
   morning, this is the file that says what was actually sent. */
try {
  writeFileSync(join(HOME, 'last-brief.json'), JSON.stringify(brief, null, 2))
} catch { /* best effort */ }
