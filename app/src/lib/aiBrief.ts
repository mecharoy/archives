/* The brief, written on the phone.

   Once a day — the first time the app is opened after six in the evening, or
   the next morning if the evening was missed — the phone builds the same
   summary the server used to, has Gemini write the sentences (names swapped
   for labels first), checks them, and keeps the result here. No PC, no
   server needed. Offline, the computed half is kept and the words are tried
   again the next time the app is opened.

   The key is typed into Settings and lives in this phone's own storage. It is
   never built into the app: an APK is a public file, and a key inside one is a
   key that Google will find and cancel. It is also kept out of the backup, out
   of the sync queue, and out of every message and log line this file writes. */

import { kvGet, kvSet } from './db'
import { getState, setState, saveSettings } from './store'
import { rowForEntry, rowForMaster } from './model'
import { parseBrief, shouldReplace } from './brief'
import { t } from './i18n'
import schemaSql from '../../server/schema.sql?raw'
import prompt from '../../nightly/prompt.md?raw'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'

const EVENING_HOUR = 18
const RETRY_MINUTES = 30

export interface AiStatus {
  at: string
  ok: boolean
  model: string
  log: string[]
  error?: { kind: string; detail: string }
}

let running: Promise<string> | null = null

const istNow = () => new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const currentKey = () => (getState().settings.ai_key || '').trim()
export const hasAiKey = () => currentKey().length > 0

/** A fingerprint that says "this is the same key as before" without keeping any
    of it. */
function fingerprint(key: string): string {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  return `${key.length}:${h}`
}

/** Save a key typed or pasted into Settings. Returns what was actually stored
    (stray quotes and a pasted "GEMINI_API_KEY=" are removed). */
export async function setAiKey(raw: string): Promise<string> {
  const { cleanKey } = await import('../../nightly/gemini.mjs')
  const key = cleanKey(raw)
  await saveSettings({ ai_key: key })
  // A new key deserves an immediate try, not a wait for the next 30 minutes.
  await kvSet('ai_brief_tried_at', '')
  await kvSet('ai_key_bad', '')
  return key
}

/** Is today's brief due? Once per evening; a missed evening is caught up next morning. */
async function isDue(): Promise<boolean> {
  const now = istNow()
  const today = ymd(now)
  const yesterday = ymd(new Date(now.getTime() - 86400000))
  const done = await kvGet<string>('ai_brief_day', '')
  const triedAt = await kvGet<string>('ai_brief_tried_at', '')
  // A key Google already refused will be refused again; wait for a new one.
  if (fingerprint(currentKey()) === (await kvGet<string>('ai_key_bad', ''))) return false
  if (triedAt && Date.now() - new Date(triedAt).getTime() < RETRY_MINUTES * 60000) return false
  if (now.getHours() >= EVENING_HOUR) return done !== today
  return done < yesterday
}

/** Run if it is due. Silent: never throws, never nags. */
export async function maybeMakeBrief(): Promise<void> {
  if (!hasAiKey() || !(await isDue())) return
  await makePhoneBrief()
}

/** Build it now. Returns '' on success, or a short reason. */
export function makePhoneBrief(): Promise<string> {
  if (!running) running = run().finally(() => { running = null })
  return running
}

/** What went wrong, in his language, with what to do about it. */
export function explainAiError(kind: string): string {
  switch (kind) {
    case 'no_key': return t('এখনও কোনো কী বসানো হয়নি')
    case 'key': return t('গুগল এই কী নিচ্ছে না — ভুল, মেয়াদ শেষ, বা বাতিল হয়ে গেছে। aistudio.google.com/apikey থেকে নতুন কী নিন।')
    case 'quota': return t('আজকের বিনামূল্যের সীমা শেষ — কাল আবার চলবে।')
    case 'busy': return t('গুগলের সার্ভার এখন ব্যস্ত — একটু পরে আবার চেষ্টা হবে।')
    case 'network': return t('নেট পাওয়া যাচ্ছে না')
    case 'blocked': return t('গুগল এই হিসাব লিখতে রাজি হয়নি।')
    default: return t('এআই ঠিকমতো লিখতে পারেনি — একটু পরে আবার চেষ্টা হবে।')
  }
}

/** Ask Google whether a key is accepted — without spending any of its quota.
    '' means it works; otherwise the reason, in his language. */
export async function testAiKey(raw: string): Promise<{ ok: boolean; message: string; detail: string }> {
  const { testKey } = await import('../../nightly/gemini.mjs')
  const r = await testKey(raw)
  if (r.ok) return { ok: true, message: t('কী ঠিক আছে — গুগল নিচ্ছে'), detail: '' }
  return { ok: false, message: explainAiError(r.kind), detail: r.detail || '' }
}

async function run(): Promise<string> {
  const key = currentKey()
  await kvSet('ai_brief_tried_at', new Date().toISOString())
  const s = getState()
  const rows = [...s.masters.map(rowForMaster), ...s.entries.map(rowForEntry)]
  try {
    const [{ default: initSqlJs }, { makeBrief }, { scrubKey }] = await Promise.all([
      import('sql.js'),
      import('../../nightly/phone-brief.mjs'),
      import('../../nightly/gemini.mjs'),
    ])
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    const out = await makeBrief({ SQL, schemaSql, rows, prompt, key })
    const parsed = parseBrief(out.brief)
    if (!parsed) throw new Error('brief failed its own check')

    const at = new Date().toISOString()
    // The phone's own words beat a computed-only brief; a computed-only brief
    // never replaces a good one that is still fresh (see shouldReplace).
    if (shouldReplace(getState().brief, parsed)) {
      await kvSet('brief', parsed)
      await kvSet('brief_fetched_at', at)
      setState({ brief: parsed, brief_fetched_at: at })
    }
    const status: AiStatus = {
      at, ok: !!out.model, model: out.model,
      log: out.log.map((l: string) => scrubKey(l, key)),
      error: out.modelError || undefined,
    }
    await kvSet('ai_brief_status', status)
    // Only a brief with the model's words counts as done for the day; a
    // computed-only one is kept, and the words are tried again later.
    if (out.model) await kvSet('ai_brief_day', ymd(istNow()))
    if (out.modelError && out.modelError.kind === 'key') await kvSet('ai_key_bad', fingerprint(key))
    return out.model ? '' : explainAiError(out.modelError ? out.modelError.kind : 'other')
  } catch (e) {
    const { scrubKey } = await import('../../nightly/gemini.mjs')
    const msg = scrubKey(e instanceof Error ? e.message : String(e), key)
    await kvSet('ai_brief_status', { at: new Date().toISOString(), ok: false, model: '', log: [msg] } as AiStatus)
    return msg.slice(0, 120)
  }
}

export const aiStatus = () => kvGet<AiStatus | null>('ai_brief_status', null)

