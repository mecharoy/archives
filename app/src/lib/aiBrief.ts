/* The brief, written on the phone.

   Once a day — the first time the app is opened after six in the evening, or
   the next morning if the evening was missed — the phone builds the same
   summary the server used to, has Gemini write the sentences (names swapped
   for labels first), checks them, and keeps the result here. No PC, no
   server needed. Offline, the computed half is kept and the words are tried
   again the next time the app is opened.

   The key is baked in at build time (VITE_GEMINI_KEY, read by vite.config.ts
   from %USERPROFILE%\.site-khata\gemini.env), never written into the repo. */

import { kvGet, kvSet } from './db'
import { getState, setState } from './store'
import { rowForEntry, rowForMaster } from './model'
import { parseBrief } from './brief'
import schemaSql from '../../server/schema.sql?raw'
import prompt from '../../nightly/prompt.md?raw'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'

const KEY = (import.meta.env.VITE_GEMINI_KEY as string | undefined)?.trim() || ''
export const hasAiKey = () => KEY.length > 0

const EVENING_HOUR = 18
const RETRY_MINUTES = 30

export interface AiStatus { at: string; ok: boolean; model: string; log: string[] }

let running: Promise<string> | null = null

const istNow = () => new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Is today's brief due? Once per evening; a missed evening is caught up next morning. */
async function isDue(): Promise<boolean> {
  const now = istNow()
  const today = ymd(now)
  const yesterday = ymd(new Date(now.getTime() - 86400000))
  const done = await kvGet<string>('ai_brief_day', '')
  const triedAt = await kvGet<string>('ai_brief_tried_at', '')
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

async function run(): Promise<string> {
  await kvSet('ai_brief_tried_at', new Date().toISOString())
  const s = getState()
  const rows = [...s.masters.map(rowForMaster), ...s.entries.map(rowForEntry)]
  try {
    const [{ default: initSqlJs }, { makeBrief }] = await Promise.all([
      import('sql.js'),
      import('../../nightly/phone-brief.mjs'),
    ])
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    const out = await makeBrief({ SQL, schemaSql, rows, prompt, key: KEY })
    const parsed = parseBrief(out.brief)
    if (!parsed) throw new Error('brief failed its own check')
    const at = new Date().toISOString()
    await kvSet('brief', parsed)
    await kvSet('brief_fetched_at', at)
    setState({ brief: parsed, brief_fetched_at: at })
    const status: AiStatus = { at, ok: !!out.model, model: out.model, log: out.log }
    await kvSet('ai_brief_status', status)
    // Only a brief with the model's words counts as done for the day; a
    // computed-only one is kept, and the words are tried again later.
    if (out.model) await kvSet('ai_brief_day', ymd(istNow()))
    return out.model ? '' : (out.log.find((l) => l.startsWith('model failed')) || 'no words from the model')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await kvSet('ai_brief_status', { at: new Date().toISOString(), ok: false, model: '', log: [msg] } as AiStatus)
    return msg.slice(0, 120)
  }
}

export const aiStatus = () => kvGet<AiStatus | null>('ai_brief_status', null)
