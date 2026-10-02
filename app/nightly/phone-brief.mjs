/* The whole nightly job, as one function the phone can run.

   rows → SQLite → summary.js (the server's own figures) → compute.mjs (every
   number on the cards) → Gemini (the sentences, names hidden) → check.mjs
   (anything invented is dropped) → assemble. Same guarantees as run.mjs: the
   model never does arithmetic, and a missing or failed model still yields a
   true brief with a plain headline chosen by rule.

   Gemini's free tier is a small model, so this file also gives it a second
   chance: when the checker throws pieces away, the model is shown exactly what
   was wrong and asked once more, and whichever answer survived better is kept. */

import { openLedger } from './ledger-sql.mjs'
import { buildSummary } from '../server/src/summary.js'
import { skeleton, plainHeadline } from './compute.mjs'
import { check } from './check.mjs'
import { anonymize, restoreNames, normalizeLabels, PROMPT_NOTE } from './anonymize.mjs'
import { askGemini, GeminiError, scrubKey } from './gemini.mjs'
import { assemble } from './assemble.mjs'

/** Kolkata time, whatever the phone's clock zone says. */
export function nowIST() {
  const d = new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000)
  const p = (x, w = 2) => String(x).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}+05:30`
}

/* Said last, because a small model weighs the end of a long prompt most. Each
   line is something check.mjs really enforces, so the model is told the truth
   about what happens to a reply that breaks it. */
export const LIMITS = `

## Hard limits — a program checks every one, and a piece that breaks one is thrown away

- Never write a rupee amount. Never write "thousand", "lakh", "crore", "হাজার", "লাখ", "কোটি" or a number followed by "k".
- Every percentage, and every number above ten, must be copied from the data. If you are not sure of a number, leave the number out.
- Bengali text goes in the _bn fields and English text in the _en fields. Never swap them. Never put the same text in both.
- One sentence per note and per alert, under 25 words.
- "todo_bn" and "todo_en" must have the same number of items, in the same order.
- Each "id" in "project_notes" is copied exactly from computed.projects[].id.
- Reply with the one JSON object and nothing else.
`

const NOTHING = () => ({ headline: null, notes: new Map(), alerts: [], todo_bn: [], todo_en: [], dropped: [] })

/** How much of a reply survived the checker — more is better. */
const kept = (w) => (w.headline ? 1 : 0) + w.notes.size + w.alerts.length + w.todo_bn.length

/** Did the second answer do better than the first? */
const better = (a, b) => b.dropped.length < a.dropped.length || (b.dropped.length === a.dropped.length && kept(b) > kept(a))

function repairPrompt(basePrompt, reply, dropped) {
  return basePrompt +
    '\n\n---\n\nYOUR PREVIOUS REPLY was checked by a program and these problems were found:\n' +
    dropped.map((d) => '- ' + d).join('\n') +
    '\n\nYOUR PREVIOUS REPLY:\n\n```json\n' + JSON.stringify(reply, null, 1) + '\n```\n\n' +
    'Write the whole JSON object again with every problem fixed. Where a number caused the problem, leave the number out of the sentence. Reply with the JSON object only.\n'
}

/** Put the real names back into the words that survived. */
function restoreWords(w, real) {
  const notes = new Map()
  for (const [id, n] of w.notes) notes.set(id, restoreNames(n, real))
  return {
    ...w,
    headline: w.headline && restoreNames(w.headline, real),
    notes,
    alerts: restoreNames(w.alerts, real),
    todo_bn: restoreNames(w.todo_bn, real),
    todo_en: restoreNames(w.todo_en, real),
  }
}

/**
 * @param o.SQL        initialised sql.js
 * @param o.schemaSql  server/schema.sql text
 * @param o.rows       every master and entry as { tab, mode, values }
 * @param o.prompt     nightly/prompt.md text
 * @param o.key        Gemini key ('' = no model; computed half only)
 * @param o.ask        optional replacement for askGemini (tests)
 * @returns {Promise<{ brief: object, summary: object, model: string,
 *                     modelError: {kind: string, detail: string}|null, log: string[] }>}
 */
export async function makeBrief(o) {
  const log = []
  const say = (l) => log.push(scrubKey(l, o.key))

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

  let words = NOTHING()
  let model = ''
  let modelError = null
  let real = new Map()

  if (o.key || o.ask) {
    const anon = anonymize({
      today: nowIST().slice(0, 10),
      summary,
      computed: { cards: base.cards, projects: base.projects, burn: base.series.burn },
    })
    real = anon.real
    const labels = new Set(real.keys())
    const prompt = o.prompt + PROMPT_NOTE + LIMITS +
      '\n\n---\n\nDATA:\n\n```json\n' + JSON.stringify(anon.payload, null, 1) + '\n```\n'
    const ask = o.ask || askGemini
    // Names stay as labels until the very end: the checker never sees a name,
    // so a supplier called "হাজারী" cannot be mistaken for money in words.
    // The model was shown the computed cards and percentages too; repeating one is a quote.
    const extra = { cards: base.cards, projects: base.projects, burn: base.series.burn }
    const grade = (json) => check(normalizeLabels(json), summary, ids, { labels, extra })

    try {
      const first = await ask(prompt, o.key)
      model = first.model
      words = grade(first.json)
      say(`words from ${model}`)

      if (words.dropped.length || !words.headline) {
        try {
          const second = await ask(repairPrompt(prompt, first.json, words.dropped), o.key)
          const again = grade(second.json)
          if (better(words, again)) {
            say(`second try kept (${words.dropped.length} → ${again.dropped.length} dropped)`)
            words = again
            model = second.model
          } else {
            say('second try was no better; first kept')
          }
        } catch (e) {
          say(`second try failed: ${String(e && e.message || e).slice(0, 120)}`)
        }
      }
      for (const d of words.dropped) say('dropped — ' + d)
      words = restoreWords(words, real)
    } catch (e) {
      model = ''
      words = NOTHING()
      // The reason is shown on the screen and stored, so the key is taken out
      // of it here, whatever kind of error carried it in.
      modelError = e instanceof GeminiError
        ? { kind: e.kind, detail: scrubKey(e.detail, o.key) }
        : { kind: 'network', detail: scrubKey(String(e && e.message || e), o.key).slice(0, 160) }
      say(`model failed: ${modelError.kind} ${modelError.detail}`.slice(0, 200))
    }
  }

  if (!words.headline) {
    words.headline = plainHeadline(summary)
    say('plain headline: ' + words.headline.en)
  }

  return { brief: assemble(base, words, nowIST(), model ? 'model' : 'rule'), summary, model, modelError, log }
}
