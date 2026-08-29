/* What the model wrote, read suspiciously.

   Nothing here trusts the model. The rules are narrow on purpose — each one
   catches a failure that would actually reach his phone and mislead him:

     1. a sentence in one language and not the other, so switching language
        blanks half the screen;
     2. a money figure invented inside prose, which is the single way a wrong
        number can get past the deterministic half of this job;
     3. a note attached to a job that does not exist;
     4. a to-do list whose two languages have drifted out of step.

   A failure is not fatal. The caller drops the offending piece and publishes
   the rest — a brief with one alert missing is still a true brief, and a
   silent night is better than a confident wrong number. */

const BN_DIGITS = /[০-৯]/g
const BN_TO_EN = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' }
const asciiDigits = (s) => String(s).replace(BN_DIGITS, (d) => BN_TO_EN[d])

/* Numbers a sentence is allowed to contain without being a quoted figure:
   percentages, day counts, headcounts, floor counts. Anything at or above a
   thousand is money by any other name, and money belongs on a card. */
const SMALL = 999

/** Every digit-group in a sentence, in ASCII, ignoring what separates them. */
function figures(text) {
  const flat = asciiDigits(text).replace(/[,‚]/g, '')
  return [...flat.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite)
}

/** Every number the summary actually contains, at any depth. */
function knownNumbers(node, into = new Set()) {
  if (typeof node === 'number' && Number.isFinite(node)) {
    into.add(Math.round(node))
    into.add(Math.round(node / 1000))
    into.add(Math.round(node / 100000))
  } else if (Array.isArray(node)) {
    for (const x of node) knownNumbers(x, into)
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) knownNumbers(node[k], into)
  }
  return into
}

/** A sentence is clean if every large number in it exists in the summary. */
function proseOk(text, known) {
  for (const f of figures(text)) {
    if (f <= SMALL) continue
    if (!known.has(Math.round(f))) return `invented figure ${f}`
  }
  return ''
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const SEVERITY = new Set(['ok', 'warn', 'crit', 'info'])

/**
 * @returns {{ headline: {bn,en}|null, notes: Map<string,{status,note_bn,note_en}>,
 *             alerts: object[], todo_bn: string[], todo_en: string[], dropped: string[] }}
 */
export function check(model, summary, projectIds) {
  const known = knownNumbers(summary)
  const dropped = []
  const drop = (what, why) => { dropped.push(`${what}: ${why}`) }

  /* --- headline --- */
  let headline = null
  const hb = str(model.headline_bn)
  const he = str(model.headline_en)
  if (!hb || !he) drop('headline', 'missing one of the two languages')
  else {
    const bad = proseOk(hb, known) || proseOk(he, known)
    if (bad) drop('headline', bad)
    else headline = { bn: hb, en: he }
  }

  /* --- one note per job --- */
  const notes = new Map()
  for (const raw of Array.isArray(model.project_notes) ? model.project_notes : []) {
    const id = str(raw && raw.id)
    const nb = str(raw && raw.note_bn)
    const ne = str(raw && raw.note_en)
    if (!projectIds.has(id)) { drop('note', `unknown job id ${id || '(none)'}`); continue }
    if (!nb || !ne) { drop(`note ${id}`, 'missing one of the two languages'); continue }
    const bad = proseOk(nb, known) || proseOk(ne, known)
    if (bad) { drop(`note ${id}`, bad); continue }
    notes.set(id, { status: SEVERITY.has(raw.status) ? raw.status : null, note_bn: nb, note_en: ne })
  }

  /* --- alerts --- */
  const alerts = []
  for (const raw of Array.isArray(model.alerts) ? model.alerts : []) {
    const tb = str(raw && raw.text_bn)
    const te = str(raw && raw.text_en)
    if (!tb || !te) { drop('alert', 'missing one of the two languages'); continue }
    const bad = proseOk(tb, known) || proseOk(te, known)
    if (bad) { drop('alert', bad); continue }
    alerts.push({ severity: SEVERITY.has(raw.severity) ? raw.severity : 'info', text_bn: tb, text_en: te })
    if (alerts.length >= 8) break
  }

  /* --- the two to-do lists, which must stay in step --- */
  const tb = (Array.isArray(model.todo_bn) ? model.todo_bn : []).map(str).filter(Boolean)
  const te = (Array.isArray(model.todo_en) ? model.todo_en : []).map(str).filter(Boolean)
  let todo_bn = [], todo_en = []
  if (tb.length !== te.length) drop('todo', `${tb.length} in Bengali against ${te.length} in English`)
  else {
    for (let i = 0; i < tb.length && todo_bn.length < 5; i++) {
      const bad = proseOk(tb[i], known) || proseOk(te[i], known)
      if (bad) { drop(`todo ${i + 1}`, bad); continue }
      todo_bn.push(tb[i]); todo_en.push(te[i])
    }
  }

  return { headline, notes, alerts, todo_bn, todo_en, dropped }
}

export const _test = { figures, knownNumbers, proseOk }
