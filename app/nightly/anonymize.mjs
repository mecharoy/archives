/* Names stay on the phone.

   The free model tier may keep what it is sent, so before the figures leave
   the phone every person and job is swapped for a short label — [J1] for a
   job, [C1] for its client, [W1] for a workman, [S1] for a shop or customer,
   [P1] for whoever a bill is owed to — and free-text notes are dropped. The
   model is told to write the labels exactly as given; they are swapped back
   for the real names when the answer arrives.

   Materials, expense heads and amounts go as they are: "cement" and "tea"
   identify nobody, and the brief is useless without them. */

const LABEL = /\[([JCWSP])(\d{1,3})\]/g

export function anonymize(payload) {
  const p = structuredClone(payload)
  const real = new Map()          // "[W1]" -> "রহিম"
  const byName = new Map()        // "W|রহিম" -> "[W1]"
  const counters = { J: 0, C: 0, W: 0, S: 0, P: 0 }
  const label = (kind, name) => {
    if (name == null || name === '') return name
    const key = kind + '|' + name
    if (!byName.has(key)) {
      const l = `[${kind}${++counters[kind]}]`
      byName.set(key, l)
      real.set(l, String(name))
    }
    return byName.get(key)
  }

  const s = p.summary || {}
  const jobLabel = new Map()
  for (const j of s.projects || []) {
    const l = label('J', j.name_bn)
    jobLabel.set(j.id, l)
    j.name_bn = l
    if (j.client_bn) j.client_bn = label('C', j.client_bn)
  }
  const br = s.breakdown || {}
  for (const r of br.suppliers || []) r.name_bn = label('S', r.name_bn)
  for (const r of br.workers || []) r.name_bn = label('W', r.name_bn)
  for (const b of (s.bills && s.bills.list) || []) {
    if (b.to_bn) b.to_bn = label('P', b.to_bn)
    delete b.note
  }
  const c = p.computed || {}
  for (const j of c.projects || []) {
    const l = jobLabel.get(j.id) || label('J', j.name_bn)
    j.name_bn = l
    j.name_en = l
  }
  return { payload: p, real }
}

/** Put the real names back into every string the model wrote. */
export function restoreNames(value, real) {
  if (typeof value === 'string') return value.replace(LABEL, (m) => real.get(m) ?? m)
  if (Array.isArray(value)) return value.map((v) => restoreNames(v, real))
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) out[k] = restoreNames(value[k], real)
    return out
  }
  return value
}

export const PROMPT_NOTE = `

## Names are labels

To keep his people private, every name in the data has been replaced with a
short label in square brackets: [J1] is a job, [C1] a client, [W1] a workman,
[S1] a shop or customer, [P1] someone a bill is owed to. Write a label exactly
as it appears — brackets, letter and number, in ASCII, in both the Bengali and
the English text — wherever you would have written the name. The phone puts
the real name back. Never invent a label that is not in the data.
`
