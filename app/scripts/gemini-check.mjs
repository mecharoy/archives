/* The Gemini harness, exercised against a pretend Google.

   No network and no key: every reply is scripted. What is being tested is that
   each way a free model can fail is recognised as that failure — a dead key is
   not "busy", a cut-off reply is not "no JSON" — and that the key travels only
   in a header and never into a message.

   `npm run gemini:check`, and it is part of `npm test`. */

import { askGemini, testKey, cleanKey, keyLooksRight, scrubKey, validateShape, isKeyProblem, GeminiError, MODELS, BRIEF_SCHEMA } from '../nightly/gemini.mjs'

let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}

/* A made-up key of the right shape, built at run time so that no line of this
   file looks like a real Google key to a secret scanner. The repository is
   public, and a push that trips a scanner is a push that does not happen. */
const fakeKey = (tag) => ['AI', 'za', 'Sy', tag.padEnd(33, 'x')].join('')
const KEY = fakeKey('TESTKEY0123456789abcdefghijklm')
const sleepImpl = async () => {}

const GOOD = {
  headline_bn: 'রামপুরে খরচ কাজের আগে।', headline_en: 'At Rampur spending is ahead of the work.',
  project_notes: [], alerts: [], todo_bn: [], todo_en: [],
}
const ok = (json, extra = {}) => ({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP', ...extra }] }) })
const err = (status, message, code) => ({ status, body: JSON.stringify({ error: { code: status, message, status: code || 'ERROR' } }) })

/** A fetch that plays a script, one entry per call, and records what it was sent. */
function fake(script) {
  const calls = []
  const impl = async (url, init) => {
    const step = script[Math.min(calls.length, script.length - 1)]
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null })
    if (step instanceof Error) throw step
    return { ok: step.status >= 200 && step.status < 300, status: step.status, text: async () => step.body }
  }
  return { impl, calls }
}

const run = async (script, o = {}) => {
  const f = fake(script)
  try {
    const r = await askGemini('PROMPT', KEY, { fetchImpl: f.impl, sleepImpl, ...o })
    return { r, calls: f.calls }
  } catch (e) {
    return { e, calls: f.calls }
  }
}

/* ---------- the key, as pasted ---------- */

ck('a bare key is left alone', cleanKey('  ' + KEY + '\n'), KEY)
ck('a pasted "GEMINI_API_KEY=" is stripped', cleanKey(`GEMINI_API_KEY=${KEY}`), KEY)
ck('quotes round it are stripped', cleanKey(`"${KEY}"`), KEY)
ck('"export NAME=value" is stripped', cleanKey(`export GEMINI_API_KEY='${KEY}'`), KEY)
ck('a real-looking key passes the sanity check', keyLooksRight(KEY), true)
ck('a half-pasted key does not', keyLooksRight('AIza123'), false)
ck('a key with a space in it does not', keyLooksRight(KEY.slice(0, 12) + ' ' + KEY.slice(12)), false)
ck('the key is scrubbed out of any text', scrubKey(`boom ${KEY} boom`, KEY), 'boom ••• boom')
ck('even a key we were not told about', scrubKey('x ' + fakeKey('A') + ' y', ''), 'x ••• y')

/* ---------- the happy path, and what is actually sent ---------- */

let t = await run([ok(GOOD)])
ck('the first model is the newest free Flash', t.r.model, MODELS[0])
ck('the reply comes back parsed', t.r.json.headline_en, GOOD.headline_en)
ck('one call was enough', t.calls.length, 1)
ck('the key goes in a header', t.calls[0].init.headers['x-goog-api-key'], KEY)
ck('and never into the URL', t.calls[0].url.includes(KEY) || /[?&]key=/.test(t.calls[0].url), false)
ck('the reply is asked for as JSON', t.calls[0].body.generationConfig.responseMimeType, 'application/json')
ck('in a fixed shape', JSON.stringify(t.calls[0].body.generationConfig.responseSchema) === JSON.stringify(BRIEF_SCHEMA), true)
ck('at low temperature', t.calls[0].body.generationConfig.temperature <= 0.3, true)
ck('with room to think and still finish', t.calls[0].body.generationConfig.maxOutputTokens >= 4096, true)
ck('the prompt is what was passed', t.calls[0].body.contents[0].parts[0].text, 'PROMPT')
ck('statuses are a closed list in the schema', BRIEF_SCHEMA.properties.project_notes.items.properties.status.enum.join(','), 'ok,warn,crit,info')
ck('the to-do lists are capped', BRIEF_SCHEMA.properties.todo_bn.maxItems, 4)

/* A model that thinks out loud must not have its thoughts read as the answer. */
t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"x": 1}', thought: true }, { text: JSON.stringify(GOOD) }] }, finishReason: 'STOP' }] }) }])
ck('thought parts are ignored', t.r && t.r.json.headline_en, GOOD.headline_en)

/* Stray prose around the object is trimmed, as it was for Claude. */
t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Here you go:\n```json\n' + JSON.stringify(GOOD) + '\n```' }] }, finishReason: 'STOP' }] }) }])
ck('a fence round the JSON is harmless', t.r && t.r.model, MODELS[0])

/* ---------- the key is the problem ---------- */

t = await run([err(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')])
ck('an invalid key is named as the key', t.e && t.e.kind, 'key')
ck('and stops at once — no other model will take it', t.calls.length, 1)

t = await run([err(403, 'Your API key was reported as leaked. Please use another API key.', 'PERMISSION_DENIED')])
ck('a leaked key is named as the key', t.e && t.e.kind, 'key')
ck('and stops at once', t.calls.length, 1)

t = await run([err(401, 'Request had invalid authentication credentials.', 'UNAUTHENTICATED')])
ck('a 401 is the key', t.e && t.e.kind, 'key')

t = await run([err(400, 'API key expired. Please renew the API key.', 'INVALID_ARGUMENT')])
ck('an expired key is the key', t.e && t.e.kind, 'key')

ck('a 403 about a model is not the key', isKeyProblem(403, JSON.stringify({ error: { message: 'Permission denied for model gemini-3.8-flash on this project.' } })), false)

t = await run([{ status: 200, body: '{}' }], {}).then(() => askGemini('P', '', { fetchImpl: fake([ok(GOOD)]).impl }).catch((e) => ({ e })))
ck('no key at all is its own kind', t.e && t.e.kind, 'no_key')
t = await askGemini('P', 'short', { fetchImpl: fake([ok(GOOD)]).impl }).catch((e) => ({ e }))
ck('a nonsense key never reaches Google', t.e && t.e.kind, 'key')

/* ---------- busy, limited, gone ---------- */

t = await run([err(403, 'Permission denied for model gemini-3.8-flash on this project.', 'PERMISSION_DENIED'), ok(GOOD)])
ck('a model this project cannot use is skipped', t.r && t.r.model, MODELS[1])
ck('after one try, not two', t.calls.length, 2)

t = await run([err(404, 'models/gemini-3.8-flash is not found', 'NOT_FOUND'), ok(GOOD)])
ck('a retired model is skipped', t.r && t.r.model, MODELS[1])

t = await run([err(429, 'quota', 'RESOURCE_EXHAUSTED'), err(429, 'quota', 'RESOURCE_EXHAUSTED'), ok(GOOD)])
ck('a rate-limited model gets one more go, then the next', t.r && t.r.model, MODELS[1])
ck('that is three calls', t.calls.length, 3)

t = await run([err(503, 'overloaded', 'UNAVAILABLE'), ok(GOOD)])
ck('a busy model is retried at once-after-a-pause and recovers', t.r && t.r.model, MODELS[0])
ck('on the same model', t.calls[1].url.includes(MODELS[0]), true)

t = await run([err(429, 'quota', 'RESOURCE_EXHAUSTED')])
ck('every model limited is reported as the limit', t.e && t.e.kind, 'quota')
ck('after trying them all, twice each', t.calls.length, MODELS.length * 2)

t = await run([err(500, 'boom', 'INTERNAL')])
ck('every model failing is reported as busy', t.e && t.e.kind, 'busy')

t = await run([new Error('Failed to fetch')])
ck('no connection is its own kind', t.e && t.e.kind, 'network')

t = await run([new Error(`request to https://x?key=${KEY} failed`)])
ck('and the key is scrubbed from what it says', t.e.detail.includes(KEY) || t.e.message.includes(KEY), false)

/* The schema may be what Google objects to; ask again without it. */
t = await run([err(400, 'Invalid JSON payload received. Unknown name "format" at generation_config.response_schema', 'INVALID_ARGUMENT'), ok(GOOD)])
ck('a schema Google rejects is dropped and the call retried', t.r && t.r.model, MODELS[0])
ck('the retry is on the same model', t.calls[1].url.includes(MODELS[0]), true)
ck('without the schema', 'responseSchema' in t.calls[1].body.generationConfig, false)
ck('but still asking for JSON', t.calls[1].body.generationConfig.responseMimeType, 'application/json')

/* ---------- a reply that is not an answer ---------- */

t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"headline_bn": "অর্ধেক' }] }, finishReason: 'MAX_TOKENS' }] }) }])
ck('a reply cut off for room is named as that', t.e && t.e.kind, 'cutoff')

t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }) }])
ck('thinking that used all the room is named as that', t.e && t.e.kind, 'cutoff')

t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }) }])
ck('a safety stop is named as that', t.e && t.e.kind, 'blocked')

t = await run([{ status: 200, body: JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } }) }])
ck('a blocked prompt is named as that', t.e && t.e.kind, 'blocked')

t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'I cannot help with that.' }] }, finishReason: 'STOP' }] }) }])
ck('prose instead of JSON is bad output', t.e && t.e.kind, 'bad_output')

t = await run([ok({ hello: 'world' })])
ck('JSON of the wrong shape is bad output', t.e && t.e.kind, 'bad_output')

t = await run([ok({ ...GOOD, alerts: 'none' })])
ck('a list that is not a list is bad output', t.e && t.e.kind, 'bad_output')

t = await run([ok({ ...GOOD, todo_bn: ['এক'], todo_en: [] })])
ck('to-do lists of different lengths are bad output', t.e && t.e.kind, 'bad_output')

t = await run([ok({ ...GOOD, headline_en: '   ' })])
ck('an empty headline is bad output', t.e && t.e.kind, 'bad_output')

t = await run([{ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a": }' }] }, finishReason: 'STOP' }] }) }, ok(GOOD)])
ck('broken JSON from one model moves on to the next', t.r && t.r.model, MODELS[1])

/* The next model down can rescue a bad answer from the first. */
t = await run([ok({ hello: 'world' }), ok(GOOD)])
ck('a wrongly shaped reply is rescued by the next model', t.r && t.r.model, MODELS[1])

ck('validateShape accepts a good reply', validateShape(GOOD).length, 0)
ck('and refuses an array', validateShape([]).length > 0, true)
ck('and a note with no id', validateShape({ ...GOOD, project_notes: [{ note_bn: 'ক' }] }).length > 0, true)

/* ---------- the deadline ---------- */

const slowFetch = async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: false, status: 503, text: async () => 'busy' } }
try {
  await askGemini('P', KEY, { fetchImpl: slowFetch, sleepImpl, deadlineMs: 50 })
  ck('a deadline stops the retries', 'no error', 'error')
} catch (e) {
  ck('a deadline stops the retries', e instanceof GeminiError, true)
}

/* ---------- testing a key ---------- */

let f = fake([{ status: 200, body: '{"models":[]}' }])
ck('a good key passes the test', (await testKey(KEY, { fetchImpl: f.impl })).ok, true)
ck('using the models list, not a paid generation', f.calls[0].url.includes('/models?') && !f.calls[0].url.includes('generateContent'), true)
ck('with the key in a header', f.calls[0].init.headers['x-goog-api-key'], KEY)

f = fake([err(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')])
let r = await testKey(KEY, { fetchImpl: f.impl })
ck('a bad key fails the test as the key', r.kind, 'key')
ck("and Google's own words are passed on", /not valid/.test(r.detail), true)

f = fake([err(403, 'Your API key was reported as leaked. Please use another API key.', 'PERMISSION_DENIED')])
ck('a leaked key fails the test as the key', (await testKey(KEY, { fetchImpl: f.impl })).kind, 'key')

f = fake([new Error('Failed to fetch')])
ck('no signal fails the test as the network', (await testKey(KEY, { fetchImpl: f.impl })).kind, 'network')

ck('an empty box fails the test without a request', (await testKey('   ', { fetchImpl: fake([]).impl })).kind, 'no_key')
ck('so does half a key', (await testKey('AIza12', { fetchImpl: fake([]).impl })).kind, 'key')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
