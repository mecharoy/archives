/* The server's database, rebuilt inside the phone.

   The brief used to be written on the PC from the Worker's D1 copy of his
   rows. On the phone we have the same rows (the outbox format — tab, mode,
   values), so we load them into an in-memory SQLite (sql.js) built from the
   very same schema.sql, and hand server/src/summary.js a tiny object that
   answers like D1. The summary code runs unchanged: one definition of every
   figure, whether it is computed on the server or in his hand.

   Pure: no Node, no Vite. The caller supplies the initialised sql.js module
   and the schema text, so this file runs in the app and in the node tests. */

import { COLUMNS, APPEND_TABS } from '../server/src/columns.js'

const BOOL_COLS = new Set(['paid', 'personal', 'active', 'web_hidden'])
const TABLE_OF = Object.fromEntries(Object.keys(COLUMNS).map((t) => [t, t.toLowerCase()]))

/** Same coercion as the Worker's `coerce`, so both sides store the same thing. */
function coerce(col, v) {
  if (BOOL_COLS.has(col)) return v === true || v === 'true' || v === 1 || v === '1' ? 1 : 0
  if (v === '' || v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

/**
 * @param SQL        the initialised sql.js module (await initSqlJs(...))
 * @param schemaSql  the text of server/schema.sql
 * @param rows       [{ tab, mode, values }] — rowForMaster / rowForEntry output
 * @param hid        any household id; there is only one household on a phone
 * @returns {{ db: object, close: () => void, loaded: number, skipped: number }}
 */
export function openLedger(SQL, schemaSql, rows, hid = 'phone') {
  const raw = new SQL.Database()
  raw.exec(schemaSql)
  const now = new Date().toISOString()
  let loaded = 0, skipped = 0
  raw.exec('BEGIN')
  for (const r of rows) {
    const cols = COLUMNS[r.tab]
    if (!cols) { skipped++; continue }
    const values = Array.isArray(r.values) ? r.values.slice(0, cols.length) : []
    while (values.length < cols.length) values.push('')
    const entityId = String(values[0] || '')
    if (!entityId) { skipped++; continue }
    // Mirrors the Worker: an append seen twice is ignored, a master restated replaces.
    const verb = APPEND_TABS.includes(r.tab) || r.mode !== 'upsert' ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE'
    const names = ['household_id', ...cols.slice(1), 'id', 'received_at']
    const bound = [hid, ...cols.slice(1).map((c, i) => coerce(c, values[i + 1])), entityId, now]
    const marks = names.map((_, i) => '?' + (i + 1)).join(', ')
    try {
      raw.run(`${verb} INTO ${TABLE_OF[r.tab]} (${names.join(', ')}) VALUES (${marks})`, bound)
      loaded++
    } catch {
      skipped++
    }
  }
  raw.exec('COMMIT')
  return { db: d1(raw), close: () => raw.close(), loaded, skipped }
}

/** Just enough of D1 for summary.js and the Worker's own routes:
    prepare(sql).bind(...args).first() / .all() / .run(), and batch([...]).
    Exported so the tests can run the Worker's real fetch handler against it. */
export function d1(raw) {
  const run = (sql, args) => {
    const stmt = raw.prepare(sql)
    try {
      if (args.length) stmt.bind(args.map((a) => (a === undefined ? null : a)))
      const out = []
      while (stmt.step()) out.push(stmt.getAsObject())
      return out
    } finally {
      stmt.free()
    }
  }
  return {
    prepare(sql) {
      let args = []
      const q = {
        bind(...a) { args = a; return q },
        async first() { return run(sql, args)[0] || null },
        async all() { return { results: run(sql, args) } },
        async run() { run(sql, args); return { meta: { changes: raw.getRowsModified() } } },
      }
      return q
    },
    // D1 runs a batch as one transaction; so does this.
    async batch(stmts) {
      raw.exec('BEGIN')
      try { for (const s of stmts) await s.run(); raw.exec('COMMIT') } catch (e) { raw.exec('ROLLBACK'); throw e }
      return []
    },
  }
}
