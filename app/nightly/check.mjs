/* What the model wrote, read suspiciously.

   Nothing here trusts the model. The rules are narrow on purpose — each one
   catches a failure that would actually reach his phone and mislead him:

     1. a sentence in one language and not the other, or the same text in both,
        so switching language blanks half the screen or shows the wrong one;
     2. a figure the data does not contain — money, a percentage, a count —
        which is the single way a wrong number can get past the deterministic
        half of this job;
     3. money written as words ("১২ হাজার", "1.2 lakh", "12k"), which cannot
        be checked against the data and is therefore refused outright;
     4. a name label the phone never issued, or one left unreplaced;
     5. a note attached to a job that does not exist;
     6. a to-do list whose two languages have drifted out of step.

   A failure is not fatal. The caller drops the offending piece and publishes
   the rest — a brief with one alert missing is still a true brief, and a
   silent night is better than a confident wrong number. */

const BN_DIGITS = /[০-৯]/g
const BN_TO_EN = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' }
const asciiDigits = (s) => String(s).replace(BN_DIGITS, (d) => BN_TO_EN[d])

/* "12,400" and "12,34,567" are one figure; "3, 4" is two. Only a comma with a
   digit on both sides is a thousands separator. */
const flatten = (s) => asciiDigits(s).replace(/(\d),(?=\d)/g, '$1')

/* A figure this size or smaller is a count — days, men, jobs — and is left
   alone. Anything larger must exist in the data. */
const COUNT_MAX = 10
/* Windows the brief itself is built on, which are true without being in any row. */
const WINDOWS = new Set([7, 14, 21, 28, 30, 36])

/** Every figure in a sentence, with whether it was written as a percentage. */
function figureList(text) {
  const out = []
  const flat = flatten(text)
  const re = /(শতকরা\s*)?(\d+(?:\.\d+)?)(\s*(?:%|٪|শতাংশ|percent|per\s*cent))?/gi
  for (const m of flat.matchAll(re)) {
    const v = Number(m[2])
    if (Number.isFinite(v)) out.push({ v, pct: Boolean(m[1] || m[3]) })
  }
  return out
}

/** Every digit-group in a sentence, in ASCII. */
const figures = (text) => figureList(text).map((f) => f.v)

/* A key that names an id, not a quantity: its digits mean nothing. */
const idKey = (k) => k === 'id' || k.endsWith('_id') || k === 'household' || k === 'token'

/** Every number the summary actually contains, at any depth — including the
    digits inside dates and names, which a sentence may legitimately repeat. */
function knownNumbers(node, into = new Set(), key = '') {
  if (typeof node === 'number' && Number.isFinite(node)) {
    into.add(Math.round(Math.abs(node)))
  } else if (typeof node === 'string') {
    if (!idKey(key)) for (const m of flatten(node).matchAll(/\d+(?:\.\d+)?/g)) into.add(Math.round(Number(m[0])))
  } else if (Array.isArray(node)) {
    for (const x of node) knownNumbers(x, into, key)
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) knownNumbers(node[k], into, k)
  }
  return into
}

/* Money written as words. The data holds 12400; "১২ হাজার" and "1.2 lakh" are
   roundings of it that cannot be checked, and the prompt forbids them. */
const SCALE_WORDS = /হাজার|লাখ|লক্ষ|কোটি|\b(?:lakhs?|lacs?|thousands?|crores?)\b/i
const KILO = /\d[\d.]*\s*k\b/i
const CURRENCY_BEFORE = /(?:₹|\brs\.?|\binr\b|\brupees?\b)\s*(\d+(?:\.\d+)?)/gi
const CURRENCY_AFTER = /(\d+(?:\.\d+)?)\s*(?:₹|টাকা|\brs\b\.?|\brupees?\b|\binr\b)/gi

/** A name label, in the one form the phone issues: [W1]. */
const LABEL_ANY = /\[[A-Za-z]\d{1,3}\]/g

/**
 * Is this sentence clean? Returns '' or a short reason.
 * @param labels  the labels the phone issued, or undefined when none were
 */
function proseOk(text, known, labels) {
  const raw = String(text)
  if (labels) {
    for (const l of raw.match(LABEL_ANY) || []) if (!labels.has(l)) return `unknown label ${l}`
  }
  // Labels carry digits of their own; they are not figures.
  const plain = raw.replace(LABEL_ANY, ' ')
  const flat = flatten(plain)

  if (SCALE_WORDS.test(flat)) return 'money written in words'
  if (KILO.test(flat)) return 'money written with a k'

  for (const re of [CURRENCY_BEFORE, CURRENCY_AFTER]) {
    re.lastIndex = 0
    for (const m of flat.matchAll(re)) {
      const v = Number(m[1])
      if (v < 100) return `money figure ${v} cannot be checked`
      if (!known.has(Math.round(v))) return `invented figure ${v}`
    }
  }

  for (const { v, pct } of figureList(plain)) {
    if (pct) {
      let near = false
      for (const k of known) if (Math.abs(k - v) <= 1) { near = true; break }
      if (!near) return `invented percentage ${v}`
      continue
    }
    if (v <= COUNT_MAX || WINDOWS.has(v)) continue
    if (!known.has(Math.round(v))) return `invented figure ${v}`
  }
  return ''
}

/* A model that swaps the two languages, or pastes one into both, passes a
   field-present test and still blanks half the screen. */
const HAS_BN = /[ঀ-৿]/
const HAS_EN = /[A-Za-z]/
function languagesOk(bn, en) {
  if (!HAS_BN.test(bn.replace(LABEL_ANY, ''))) return 'the Bengali has no Bengali in it'
  if (!HAS_EN.test(en.replace(LABEL_ANY, ''))) return 'the English has no English in it'
  if (bn === en) return 'the same text in both languages'
  return ''
}

/* What the phone can show without cutting a sentence in half. */
const MAX = { headline: 200, note: 200, alert: 260, todo: 200 }

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const SEVERITY = new Set(['ok', 'warn', 'crit', 'info'])

/**
 * @param model       the reply, parsed
 * @param summary     the figures it was given
 * @param projectIds  Set of real job ids
 * @param opts.labels Set of name labels the phone issued ("[W1]"); when given,
 *                    any other label in the text is an invention
 * @param opts.extra  anything else the model was SHOWN besides the summary — the
 *                    computed cards, job percentages and burn rows. A figure the
 *                    model repeats from there is a quote, not an invention: the
 *                    silence card is where "nothing written for 32 days" gets its 32.
 * @returns {{ headline: {bn,en}|null, notes: Map<string,{status,note_bn,note_en}>,
 *             alerts: object[], todo_bn: string[], todo_en: string[], dropped: string[] }}
 */
export function check(model, summary, projectIds, opts = {}) {
  const known = knownNumbers(summary)
  if (opts.extra) knownNumbers(opts.extra, known)
  const { labels } = opts
  const dropped = []
  const drop = (what, why) => { dropped.push(`${what}: ${why}`) }

  /** The single test every bilingual piece goes through. */
  const pair = (what, bn, en, max) => {
    if (!bn || !en) { drop(what, 'missing one of the two languages'); return false }
    if (bn.length > max || en.length > max) { drop(what, 'too long to show whole'); return false }
    const lang = languagesOk(bn, en)
    if (lang) { drop(what, lang); return false }
    const bad = proseOk(bn, known, labels) || proseOk(en, known, labels)
    if (bad) { drop(what, bad); return false }
    return true
  }

  /* --- headline --- */
  let headline = null
  const hb = str(model.headline_bn)
  const he = str(model.headline_en)
  if (pair('headline', hb, he, MAX.headline)) headline = { bn: hb, en: he }

  /* --- one note per job --- */
  const notes = new Map()
  for (const raw of Array.isArray(model.project_notes) ? model.project_notes : []) {
    const id = str(raw && raw.id)
    const nb = str(raw && raw.note_bn)
    const ne = str(raw && raw.note_en)
    if (!projectIds.has(id)) { drop('note', `unknown job id ${id || '(none)'}`); continue }
    if (notes.has(id)) { drop(`note ${id}`, 'a second note for the same job'); continue }
    if (!pair(`note ${id}`, nb, ne, MAX.note)) continue
    notes.set(id, { status: SEVERITY.has(raw.status) ? raw.status : null, note_bn: nb, note_en: ne })
  }

  /* --- alerts --- */
  const alerts = []
  for (const raw of Array.isArray(model.alerts) ? model.alerts : []) {
    const tb = str(raw && raw.text_bn)
    const te = str(raw && raw.text_en)
    if (!pair('alert', tb, te, MAX.alert)) continue
    alerts.push({ severity: SEVERITY.has(raw.severity) ? raw.severity : 'info', text_bn: tb, text_en: te })
    if (alerts.length >= 8) break
  }

  /* --- the two to-do lists, which must stay in step --- */
  const tb = (Array.isArray(model.todo_bn) ? model.todo_bn : []).map(str).filter(Boolean)
  const te = (Array.isArray(model.todo_en) ? model.todo_en : []).map(str).filter(Boolean)
  const todo_bn = [], todo_en = []
  if (tb.length !== te.length) drop('todo', `${tb.length} in Bengali against ${te.length} in English`)
  else {
    for (let i = 0; i < tb.length && todo_bn.length < 5; i++) {
      if (!pair(`todo ${i + 1}`, tb[i], te[i], MAX.todo)) continue
      todo_bn.push(tb[i]); todo_en.push(te[i])
    }
  }

  return { headline, notes, alerts, todo_bn, todo_en, dropped }
}

export const _test = { figures, figureList, knownNumbers, proseOk, languagesOk }
