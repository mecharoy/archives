/* The whole nightly job, as one function the phone can run.

   rows → SQLite → summary.js (the server's own figures) → compute.mjs (every
   number on the cards) → Gemini (the sentences, names hidden) → check.mjs
   (anything invented is dropped) → assemble. Same guarantees as run.mjs: the
   model never does arithmetic, and a missing or failed model still yields a
   true brief with a plain headline chosen by rule. */

import { openLedger } from './ledger-sql.mjs'
import { buildSummary } from '../server/src/summary.js'
import { skeleton, plainHeadline } from './compute.mjs'
import { check } from './check.mjs'
import { anonymize, restoreNames, PROMPT_NOTE } from './anonymize.mjs'
import { askGemini } from './gemini.mjs'
import { assemble } from './assemble.mjs'

/** Kolkata time, whatever the phone's clock zone says. */
export function nowIST() {
  const d = new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000)
  const p = (x, w = 2) => String(x).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}+05:30`
}

/**
 * @param o.SQL        initialised sql.js
 * @param o.schemaSql  server/schema.sql text
 * @param o.rows       every master and entry as { tab, mode, values }
 * @param o.prompt     nightly/prompt.md text
 * @param o.key        Gemini key ('' = no model; computed half only)
 * @param o.ask        optional replacement for askGemini (tests)
 * @returns {Promise<{ brief: object, summary: object, model: string, log: string[] }>}
 */
export async function makeBrief(o) {
  const log = []
  const say = (l) => log.push(l)

  const ledger = openLedger(o.SQL, o.schemaSql, o.rows)
  let summary
  try {
    summary = await buildSummary(ledger.db, 'phone')
  } finally {
    ledger.close()
  }
  const b = summary.business
  say(`figures: ${ledger.loaded} rows, ${summary.projects.length} jobs, ${b.entries_last_3_days} entries in 3 days`)

  const base = skeleton(summary)
  const ids = new Set(base.projects.map((p) => p.id))

  let written = null
  let model = ''
  if (o.key || o.ask) {
    const { payload, real } = anonymize({
      today: nowIST().slice(0, 10),
      summary,
      computed: { cards: base.cards, projects: base.projects, burn: base.series.burn },
    })
    const prompt = o.prompt + PROMPT_NOTE +
      '\n\n---\n\nDATA:\n\n```json\n' + JSON.stringify(payload, null, 1) + '\n```\n'
    try {
      const ans = await (o.ask || askGemini)(prompt, o.key)
      written = restoreNames(ans.json, real)
      model = ans.model
      say(`words from ${model}`)
    } catch (e) {
      say(`model failed: ${String(e && e.message || e).slice(0, 200)}`)
    }
  }

  let words = { headline: null, notes: new Map(), alerts: [], todo_bn: [], todo_en: [], dropped: [] }
  if (written) {
    words = check(written, summary, ids)
    for (const d of words.dropped) say('dropped — ' + d)
  }
  if (!words.headline) {
    words.headline = plainHeadline(summary)
    say('plain headline: ' + words.headline.en)
  }

  return { brief: assemble(base, words, nowIST()), summary, model, log }
}
