/* The words, from Gemini's free tier — and the harness around a model that is
   free because it is small.

   A small model is allowed to be unreliable; the brief is not. So this file
   does not trust a single reply to be well-formed, and it does not mistake one
   kind of failure for another:

     - the reply is asked for as JSON in a fixed shape (statuses are a closed
       list, list lengths are capped), at low temperature;
     - the shape is checked again here, because a schema is a request, not a
       guarantee;
     - a busy model (429, 5xx, time-out) is retried once, then the next model
       down is tried; a model that is gone (404) is skipped;
     - a bad KEY stops everything at once — no other model will accept it — and
       says so in words he can act on, instead of "no JSON object";
     - a reply cut short, blocked, or empty is named as that.

   Newest free Flash first. The Pro models have no free quota. The 2.5 models
   are closed to new projects, and a fresh key is a fresh project, so the last
   rung is a Flash-Lite instead. Ids checked against ai.google.dev/gemini-api/
   docs/models on 2026-10-01. */

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite']
const API = 'https://generativelanguage.googleapis.com/v1beta'

/** What went wrong, as one of a few kinds the screen can explain. */
export class GeminiError extends Error {
  /** @param {'no_key'|'key'|'quota'|'busy'|'blocked'|'cutoff'|'bad_output'|'network'|'model'} kind */
  constructor(kind, detail = '') {
    super(detail ? `${kind}: ${detail}` : kind)
    this.kind = kind
    this.detail = detail
  }
}

/* ------------------------------------------------------------------ key */

/** What was pasted, made into what Google expects. Pasting "GEMINI_API_KEY=…"
    or a key with quotes round it is the commonest mistake there is. */
export function cleanKey(raw) {
  let k = String(raw ?? '').trim()
  k = k.replace(/^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY|key)\s*[=:]\s*/i, '')
  k = k.replace(/^["'`]+|["'`]+$/g, '').trim()
  return k
}

/** Cheap, offline sanity check — catches a half-pasted key before a request does. */
export function keyLooksRight(key) {
  return key.length >= 20 && key.length <= 200 && /^[A-Za-z0-9_\-.]+$/.test(key)
}

/** Take a key out of any text that might be shown or stored. */
export function scrubKey(text, key) {
  let s = String(text ?? '')
  if (key && key.length >= 8) s = s.split(key).join('•••')
  return s.replace(/AIza[0-9A-Za-z_-]{20,}/g, '•••')
}

/* -------------------------------------------------------- reading errors */

/** Is this response Google saying the KEY is the problem? A 403 can also mean
    "this project may not use this model", which the next model might fix, so a
    bare 403 is not enough — the body has to be about the key. */
export function isKeyProblem(status, body) {
  const b = String(body || '')
  if (status === 401) return true
  if (status === 400 && /api[_ ]?key[_ ]?(?:invalid|not valid|expired)|api key (?:not valid|expired|is invalid)|key (?:is )?(?:invalid|expired)/i.test(b)) return true
  if (status === 403 && /api[_ ]?key|leaked|revoked|key.*(?:suspend|disabled|restrict)|(?:suspend|disabled).*key/i.test(b)) return true
  return false
}

/** The one sentence from Google's error body, for the screen. */
export function googleReason(body) {
  try {
    const j = JSON.parse(body)
    const m = j && j.error && j.error.message
    if (m) return String(m).replace(/\s+/g, ' ').slice(0, 200)
  } catch { /* not JSON */ }
  return String(body || '').replace(/\s+/g, ' ').slice(0, 160)
}

/* ---------------------------------------------------------------- shape */

const STATUS = ['ok', 'warn', 'crit', 'info']
const SEVERITY = ['crit', 'warn', 'info']
const S = { type: 'STRING' }
const list = (items, maxItems) => ({ type: 'ARRAY', items, maxItems })

/** The reply, as Google's response schema. Lengths are not constrained here
    (maxLength is not supported); validateShape and check.mjs clamp them. */
export const BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline_bn: S,
    headline_en: S,
    project_notes: list({
      type: 'OBJECT',
      properties: { id: S, status: { type: 'STRING', enum: STATUS, format: 'enum' }, note_bn: S, note_en: S },
      required: ['id', 'status', 'note_bn', 'note_en'],
    }, 12),
    alerts: list({
      type: 'OBJECT',
      properties: { severity: { type: 'STRING', enum: SEVERITY, format: 'enum' }, text_bn: S, text_en: S },
      required: ['severity', 'text_bn', 'text_en'],
    }, 8),
    todo_bn: list(S, 4),
    todo_en: list(S, 4),
  },
  required: ['headline_bn', 'headline_en', 'project_notes', 'alerts', 'todo_bn', 'todo_en'],
}

/** Structural problems with a reply, as plain sentences the model can be told
    about. Empty means the shape is right; it says nothing about the content. */
export function validateShape(j) {
  const bad = []
  if (!j || typeof j !== 'object' || Array.isArray(j)) return ['the reply is not a JSON object']
  for (const k of ['headline_bn', 'headline_en']) {
    if (typeof j[k] !== 'string' || !j[k].trim()) bad.push(`"${k}" must be a non-empty string`)
  }
  for (const k of ['project_notes', 'alerts', 'todo_bn', 'todo_en']) {
    if (!Array.isArray(j[k])) bad.push(`"${k}" must be a list (an empty list [] is fine)`)
  }
  if (Array.isArray(j.todo_bn) && Array.isArray(j.todo_en) && j.todo_bn.length !== j.todo_en.length) {
    bad.push('"todo_bn" and "todo_en" must have the same number of items, in the same order')
  }
  for (const [i, n] of (Array.isArray(j.project_notes) ? j.project_notes : []).entries()) {
    if (!n || typeof n.id !== 'string') bad.push(`project_notes[${i}] needs an "id" copied from the data`)
  }
  return bad
}

/* -------------------------------------------------------------- the call */

/**
 * @param {string} prompt
 * @param {string} key
 * @param {object} [o]
 * @param {string[]} [o.models]
 * @param {number} [o.timeoutMs]    per request
 * @param {number} [o.deadlineMs]   for the whole call, all models together
 * @param {object|null} [o.schema]  response schema; null to send none
 * @param {Function} [o.fetchImpl]
 * @param {Function} [o.sleepImpl]
 * @returns {Promise<{ json: object, model: string }>}
 * @throws {GeminiError}
 */
export async function askGemini(prompt, key, o = {}) {
  const {
    models = MODELS, timeoutMs = 60_000, deadlineMs = 150_000,
    schema = BRIEF_SCHEMA, fetchImpl = fetch, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = o
  key = cleanKey(key)
  if (!key) throw new GeminiError('no_key')
  if (!keyLooksRight(key)) throw new GeminiError('key', 'that does not look like a Google API key')

  const started = Date.now()
  let useSchema = !!schema
  let last = new GeminiError('network', 'no model answered')

  for (const model of models) {
    // A model gets a second go only when it said it was busy.
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (Date.now() - started > deadlineMs) throw last
      if (attempt === 2) await sleepImpl(3000)

      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      let res, body
      try {
        res = await fetchImpl(`${API}/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              // Thinking tokens count against this on the 3.x models, so it is
              // generous: a cut-off JSON is worse than a long one.
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              ...(useSchema ? { responseSchema: schema } : {}),
            },
          }),
          signal: ctrl.signal,
        })
        body = await res.text()
      } catch (e) {
        last = new GeminiError('network', `${model}: ${scrubKey(e && e.message || e, key).slice(0, 120)}`)
        continue // offline or timed out: one more go, then the next model
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        const why = `${model} ${res.status} ${scrubKey(googleReason(body), key)}`
        if (isKeyProblem(res.status, body)) throw new GeminiError('key', why)
        if (res.status === 400 && useSchema) {
          // Our schema may be what it dislikes; ask again without one, and let
          // validateShape and the checker do the policing instead.
          useSchema = false
          last = new GeminiError('model', why)
          attempt--
          continue
        }
        if (res.status === 429) { last = new GeminiError('quota', why); continue }
        if (res.status >= 500) { last = new GeminiError('busy', why); continue }
        last = new GeminiError('model', why)
        break // 400, 403, 404: this model will not do; try the next
      }

      let data
      try { data = JSON.parse(body) } catch { last = new GeminiError('bad_output', `${model}: not JSON`); continue }

      const block = data && data.promptFeedback && data.promptFeedback.blockReason
      if (block) { last = new GeminiError('blocked', `${model}: prompt blocked (${block})`); break }

      const cand = data && data.candidates && data.candidates[0]
      const finish = cand && cand.finishReason
      const parts = (cand && cand.content && cand.content.parts) || []
      const text = parts.filter((x) => !x.thought).map((x) => x.text || '').join('')

      if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST') {
        last = new GeminiError('blocked', `${model}: stopped (${finish})`); break
      }
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start < 0 || end <= start) {
        last = finish === 'MAX_TOKENS'
          ? new GeminiError('cutoff', `${model}: ran out of room before finishing`)
          : new GeminiError('bad_output', `${model}: no JSON object in the reply`)
        break
      }
      let json
      try { json = JSON.parse(text.slice(start, end + 1)) } catch {
        last = finish === 'MAX_TOKENS'
          ? new GeminiError('cutoff', `${model}: ran out of room before finishing`)
          : new GeminiError('bad_output', `${model}: the JSON was broken`)
        break
      }
      const shape = validateShape(json)
      if (shape.length) { last = new GeminiError('bad_output', `${model}: ${shape[0]}`); break }
      return { json, model }
    }
  }
  throw last
}

/* ------------------------------------------------------------- key test */

/**
 * Ask Google whether the key is accepted, without spending any generation
 * quota: listing models needs a valid key and nothing else.
 * @returns {Promise<{ ok: true } | { ok: false, kind: string, detail: string }>}
 */
export async function testKey(rawKey, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  const key = cleanKey(rawKey)
  if (!key) return { ok: false, kind: 'no_key', detail: '' }
  if (!keyLooksRight(key)) return { ok: false, kind: 'key', detail: 'that does not look like a Google API key' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': key }, signal: ctrl.signal })
    const body = await res.text()
    if (res.ok) return { ok: true }
    if (isKeyProblem(res.status, body)) return { ok: false, kind: 'key', detail: scrubKey(googleReason(body), key) }
    if (res.status === 429) return { ok: false, kind: 'quota', detail: scrubKey(googleReason(body), key) }
    return { ok: false, kind: 'model', detail: `${res.status} ${scrubKey(googleReason(body), key)}` }
  } catch (e) {
    return { ok: false, kind: 'network', detail: scrubKey(e && e.message || e, key).slice(0, 120) }
  } finally {
    clearTimeout(timer)
  }
}
