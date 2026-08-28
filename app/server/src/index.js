/* Site Khata — the online ledger.
 *
 * One Worker, one D1 database, no account for the person using the app. His
 * phone carries a device token baked in at build time; it can append to his
 * own household and read it back, and that is all it can do. Reading across
 * households, writing the nightly brief and exporting are gated behind an
 * admin token that never ships inside the APK.
 *
 * The phone remains the store of record. This is the copy that survives the
 * phone going into a bucket of water, and the thing you can look at from
 * eight hundred miles away.
 */

import { COLUMNS, APPEND_TABS } from './columns.js'
import { buildSummary } from './summary.js'
import { dashboardHtml } from './dashboard.js'

const TABLE_OF = Object.fromEntries(Object.keys(COLUMNS).map((t) => [t, t.toLowerCase()]))
const BOOL_COLS = new Set(['paid', 'personal', 'active'])
const MAX_ROWS = 200
const MAX_BODY = 1_000_000

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))

    try {
      const res = await route(request, env, url, path)
      return cors(res)
    } catch (err) {
      return cors(json({ ok: false, error: String(err && err.message || err).slice(0, 200) }, 500))
    }
  },
}

async function route(request, env, url, path) {
  const m = request.method

  if (path === '/' && m === 'GET') return html(dashboardHtml())
  if (path === '/health' && m === 'GET') return json({ ok: true, service: 'site-khata' })

  // --- the phone ---
  if (path === '/rows' && m === 'POST') return postRows(request, env)
  if (path === '/pull' && m === 'GET') return pull(request, env, url)
  if (path === '/summary' && m === 'GET') return summary(request, env, url)
  if (path === '/brief.json' && m === 'GET') return getBrief(request, env, url)

  // --- you ---
  if (path === '/brief' && (m === 'PUT' || m === 'POST')) return putBrief(request, env, url)
  if (path === '/export.csv' && m === 'GET') return exportCsv(request, env, url)
  if (path === '/admin/households' && m === 'GET') return listHouseholds(request, env)
  if (path === '/admin/households' && m === 'POST') return createHousehold(request, env)

  return json({ ok: false, error: 'not found' }, 404)
}

/* ---------------------------------------------------------------- auth */

/** Length-independent comparison, so a token cannot be guessed a byte at a time. */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0)
  return diff === 0
}

function bearer(request) {
  const h = request.headers.get('Authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

function isAdmin(request, env) {
  return sameToken(bearer(request), env.ADMIN_TOKEN || '')
}

/** A device token resolves to exactly one household and nothing else. */
async function householdFor(env, token) {
  if (!token || token.length < 16) return null
  const row = await env.DB.prepare('SELECT id, name FROM households WHERE device_token = ?1').bind(token).first()
  return row || null
}

/** Reads accept either an admin token plus ?household=, or a device token. */
async function readerFor(request, env, url) {
  if (isAdmin(request, env)) {
    const hid = url.searchParams.get('household')
    if (!hid) return { error: 'household required' }
    const row = await env.DB.prepare('SELECT id, name FROM households WHERE id = ?1').bind(hid).first()
    return row ? { household: row, admin: true } : { error: 'unknown household' }
  }
  const token = bearer(request) || url.searchParams.get('token') || ''
  const household = await householdFor(env, token)
  return household ? { household, admin: false } : { error: 'token' }
}

/* ------------------------------------------------------------- writing */

async function postRows(request, env) {
  const text = await request.text()
  if (text.length > MAX_BODY) return json({ ok: false, error: 'too large' }, 413)

  let body
  try { body = JSON.parse(text) } catch { return json({ ok: false, error: 'bad json' }, 400) }

  const household = await householdFor(env, body.token)
  if (!household) return json({ ok: false, error: 'token' }, 401)

  // The app calls this with no rows to check its settings.
  if (body.ping) return json({ ok: true, household: household.name, accepted: [], rejected: [] })

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : []
  const now = new Date().toISOString()
  const accepted = []
  const rejected = []
  const statements = []

  for (const r of rows) {
    try {
      statements.push(statementFor(env, household.id, r, now))
      accepted.push(r.id)
    } catch (err) {
      rejected.push({ id: r.id, error: String(err.message || err).slice(0, 120) })
    }
  }

  if (statements.length) await env.DB.batch(statements)
  return json({ ok: true, accepted, rejected })
}

function statementFor(env, hid, r, now) {
  const cols = COLUMNS[r.tab]
  if (!cols) throw new Error('unknown tab')
  const table = TABLE_OF[r.tab]

  const values = Array.isArray(r.values) ? r.values.slice(0, cols.length) : []
  while (values.length < cols.length) values.push('')

  const entityId = String(values[0] || '')
  if (!entityId) throw new Error('missing id')

  // An append that arrives twice — a retry after a timeout that actually
  // landed — is dropped by the primary key rather than by bookkeeping.
  // A master row is the same fact restated, so it replaces.
  const verb = APPEND_TABS.includes(r.tab) || r.mode !== 'upsert'
    ? 'INSERT OR IGNORE'
    : 'INSERT OR REPLACE'

  const names = ['household_id', ...cols.slice(1), 'id', 'received_at']
  const bound = [
    hid,
    ...cols.slice(1).map((c, i) => coerce(c, values[i + 1])),
    entityId,
    now,
  ]
  const marks = names.map((_, i) => '?' + (i + 1)).join(', ')
  return env.DB.prepare(`${verb} INTO ${table} (${names.join(', ')}) VALUES (${marks})`).bind(...bound)
}

function coerce(col, v) {
  if (BOOL_COLS.has(col)) return v === true || v === 'true' || v === 1 || v === '1' ? 1 : 0
  if (v === '' || v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

/* ------------------------------------------------------------- reading */

async function pull(request, env, url) {
  const who = await readerFor(request, env, url)
  if (who.error) return json({ ok: false, error: who.error }, 401)

  const out = {}
  for (const [tab, cols] of Object.entries(COLUMNS)) {
    const res = await env.DB.prepare(
      `SELECT ${cols.join(', ')} FROM ${TABLE_OF[tab]} WHERE household_id = ?1`
    ).bind(who.household.id).all()
    out[tab] = (res.results || []).map((row) => cols.map((c) => row[c]))
  }
  return json({ ok: true, household: who.household.name, columns: COLUMNS, tables: out })
}

async function summary(request, env, url) {
  const who = await readerFor(request, env, url)
  if (who.error) return json({ ok: false, error: who.error }, 401)
  const data = await buildSummary(env.DB, who.household.id)
  return json({ ok: true, household: who.household.name, ...data })
}

/* --------------------------------------------------------------- brief */

async function getBrief(request, env, url) {
  const who = await readerFor(request, env, url)
  if (who.error) return json({ ok: false, error: who.error }, 401)
  const row = await env.DB.prepare('SELECT body FROM briefs WHERE household_id = ?1')
    .bind(who.household.id).first()
  if (!row) return json({ ok: false, error: 'no brief yet' }, 404)
  return new Response(row.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  })
}

async function putBrief(request, env, url) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'admin token required' }, 401)
  const hid = url.searchParams.get('household')
  if (!hid) return json({ ok: false, error: 'household required' }, 400)

  const text = await request.text()
  let body
  try { body = JSON.parse(text) } catch { return json({ ok: false, error: 'bad json' }, 400) }
  if (!body.generated_at || Number.isNaN(Date.parse(body.generated_at))) {
    return json({ ok: false, error: 'generated_at must be an ISO timestamp' }, 400)
  }

  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT OR REPLACE INTO briefs (household_id, body, generated_at, received_at) VALUES (?1, ?2, ?3, ?4)`
  ).bind(hid, JSON.stringify(body), body.generated_at, now).run()
  return json({ ok: true, stored_at: now })
}

/* -------------------------------------------------------------- export */

async function exportCsv(request, env, url) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'admin token required' }, 401)
  const hid = url.searchParams.get('household')
  if (!hid) return json({ ok: false, error: 'household required' }, 400)

  const lines = []
  for (const [tab, cols] of Object.entries(COLUMNS)) {
    const res = await env.DB.prepare(
      `SELECT ${cols.join(', ')} FROM ${TABLE_OF[tab]} WHERE household_id = ?1`
    ).bind(hid).all()
    lines.push('# ' + tab, cols.join(','))
    for (const row of res.results || []) lines.push(cols.map((c) => csv(row[c])).join(','))
    lines.push('')
  }
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="site-khata-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

function csv(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/* ----------------------------------------------------------- households */

async function listHouseholds(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'admin token required' }, 401)
  const res = await env.DB.prepare('SELECT id, name, created_at FROM households ORDER BY created_at').all()
  return json({ ok: true, households: res.results || [] })
}

async function createHousehold(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: 'admin token required' }, 401)
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').slice(0, 60) || 'Household'
  const id = 'h_' + hex(8)
  const device_token = hex(24)
  await env.DB.prepare(
    'INSERT INTO households (id, name, device_token, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(id, name, device_token, new Date().toISOString()).run()
  return json({ ok: true, household: { id, name }, device_token })
}

function hex(bytes) {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/* ------------------------------------------------------------- helpers */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function html(body) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  })
}

/* The dashboard is served from this same origin, so the only cross-origin
   caller is the app during development. Tokens travel in the body or an
   Authorization header, never in a cookie, so there is nothing for a browser
   to attach automatically. */
function cors(res) {
  const h = new Headers(res.headers)
  h.set('Access-Control-Allow-Origin', '*')
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  h.set('Access-Control-Max-Age', '86400')
  return new Response(res.body, { status: res.status, headers: h })
}
