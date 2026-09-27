/* The words, from Gemini's free tier.

   Newest free Flash model first; if it is busy, rate-limited or retired, the
   next one down. The Pro models are not on the free tier (quota 0), so they
   are not tried. The reply is asked for as JSON, and any stray text around the
   object is trimmed off exactly as run.mjs did for Claude. */

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']
const URL = 'https://generativelanguage.googleapis.com/v1beta/models/'

/**
 * @returns {Promise<{ json: object, model: string }>}
 * @throws when every model failed; the message names the last failure
 */
export async function askGemini(prompt, key, { models = MODELS, timeoutMs = 90_000, fetchImpl = fetch } = {}) {
  if (!key) throw new Error('no Gemini key built into this app')
  let last = ''
  const tries = []
  // Each model gets a second go after a pause when it says it is busy (429,
  // 500, 503) — the free tier is often briefly overloaded in the evening.
  for (const model of models) tries.push(model, model)
  let prevBusy = true
  for (let i = 0; i < tries.length; i++) {
    const model = tries[i]
    const second = i % 2 === 1
    if (second && !prevBusy) continue
    if (second) await new Promise((r) => setTimeout(r, 3000))
    prevBusy = false
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(URL + model + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: ctrl.signal,
      })
      const body = await res.text()
      if (!res.ok) {
        last = `${model} ${res.status} ${body.slice(0, 160)}`
        // A bad key will not get better on the next model.
        if (res.status === 400 && /API key/i.test(body)) break
        if (res.status === 401 || res.status === 403) break
        prevBusy = res.status === 429 || res.status >= 500
        continue
      }
      const data = JSON.parse(body)
      const parts = data?.candidates?.[0]?.content?.parts || []
      const text = parts.filter((x) => !x.thought).map((x) => x.text || '').join('')
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start < 0 || end <= start) { last = `${model}: no JSON object in the reply`; continue }
      return { json: JSON.parse(text.slice(start, end + 1)), model }
    } catch (e) {
      last = `${model}: ${String(e && e.message || e).slice(0, 160)}`
      prevBusy = true
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(last || 'no model answered')
}
