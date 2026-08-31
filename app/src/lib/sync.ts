/* The outbox.
   Nothing is ever sent from the wizard directly. A saved day writes rows to
   IndexedDB and to this queue, and the queue drains whenever there is signal.
   Rows carry their own id, so a retry after a timeout that actually succeeded
   cannot duplicate the entry — the endpoint drops an id it has already seen. */

import { dbDel, dbPut } from './db'
import { getState, setState, apiUrl, type OutboxRow } from './store'
import { t, tf } from './i18n'

const BATCH = 40
const BASE_DELAY = 4000
const MAX_DELAY = 5 * 60_000

let timer: ReturnType<typeof setTimeout> | null = null
let running = false

export function scheduleSync(delay = 800) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, delay)
}

export function startSyncLoop() {
  const tick = () => {
    const s = getState()
    if (s.settings.auto_sync && s.online && s.outbox.length) void flush()
  }
  window.addEventListener('online', () => scheduleSync(1500))
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(1200) })
  setInterval(tick, 45_000)
  scheduleSync(2500)
}

function backoff(tries: number): number {
  return Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, Math.max(0, tries - 1)))
}

export async function flush(force = false): Promise<{ sent: number; error: string }> {
  const s = getState()
  if (running) return { sent: 0, error: '' }
  if (!s.outbox.length) { setState({ sync_error: '' }); return { sent: 0, error: '' } }
  if (!s.settings.endpoint) {
    // Say so in the status line too, or a stale error from before the endpoint
    // was cleared keeps sitting on the home screen.
    const msg = t('সেটিংসে ঠিকানা দেওয়া নেই')
    if (s.sync_error !== msg) setState({ sync_error: msg })
    return { sent: 0, error: msg }
  }
  if (!s.online && !force) return { sent: 0, error: '' }

  running = true
  setState({ syncing: true })
  let sent = 0
  let error = ''
  try {
    const batch = s.outbox.slice(0, BATCH)
    const res = await postRows(apiUrl('/rows'), s.settings.token, batch)
    if (res.ok) {
      const done = new Set(res.accepted)
      const keep: OutboxRow[] = []
      for (const r of getState().outbox) {
        if (done.has(r.id)) { await dbDel('outbox', r.id); sent++; continue }
        const rej = res.rejected.find((x) => x.id === r.id)
        if (rej) {
          const next = { ...r, tries: r.tries + 1, last_error: rej.error }
          await dbPut('outbox', next)
          keep.push(next)
          error = rej.error
        } else keep.push(r)
      }
      setState({ outbox: keep, sync_error: error })
    } else {
      error = res.error
      const keep = getState().outbox.map((r, i) => (i < BATCH ? { ...r, tries: r.tries + 1, last_error: error } : r))
      await Promise.all(keep.slice(0, BATCH).map((r) => dbPut('outbox', r)))
      setState({ outbox: keep, sync_error: error })
      scheduleSync(backoff(keep[0]?.tries || 1))
    }
  } catch (e) {
    error = describe(e)
    setState({ sync_error: error })
    scheduleSync(backoff((getState().outbox[0]?.tries || 0) + 1))
  } finally {
    running = false
    setState({ syncing: false })
  }
  if (!error && getState().outbox.length) scheduleSync(400)
  return { sent, error }
}

interface PostResult { ok: boolean; accepted: string[]; rejected: { id: string; error: string }[]; error: string }

async function postRows(endpoint: string, token: string, rows: OutboxRow[]): Promise<PostResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      // Sent as a simple request so the browser never fires a preflight — on a
      // patchy connection the extra round trip is the one that times out. The
      // token travels in the body for the same reason.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, rows: rows.map((r) => ({ id: r.id, tab: r.tab, mode: r.mode, values: r.values })) }),
      signal: ctrl.signal,
      redirect: 'follow',
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, accepted: [], rejected: [], error: tf('সার্ভার {0}', res.status) }
    let data: { ok?: boolean; accepted?: string[]; rejected?: { id: string; error: string }[]; error?: string }
    try { data = JSON.parse(text) } catch { return { ok: false, accepted: [], rejected: [], error: t('উত্তর বোঝা গেল না') } }
    if (!data.ok) return { ok: false, accepted: [], rejected: [], error: data.error || t('সার্ভার মানল না') }
    return { ok: true, accepted: data.accepted || [], rejected: data.rejected || [], error: '' }
  } finally {
    clearTimeout(timer)
  }
}

function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/abort/i.test(msg)) return t('সময় শেষ, আবার চেষ্টা হবে')
  if (/fetch|network/i.test(msg)) return t('নেট পাওয়া যাচ্ছে না')
  return msg.slice(0, 80)
}

/** Round-trip check for the settings screen. */
export async function testEndpoint(endpoint: string, token: string): Promise<string> {
  try {
    const res = await fetch(endpoint.replace(/\/+$/, '') + '/rows', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, rows: [], ping: true }),
      redirect: 'follow',
    })
    const text = await res.text()
    if (!res.ok) return tf('সার্ভার {0}', res.status)
    const data = JSON.parse(text) as { ok?: boolean; error?: string; household?: string }
    if (!data.ok) return data.error === 'token' ? t('টোকেন মিলল না') : (data.error || t('জোড়া লাগল না'))
    return ''
  } catch (e) {
    return describe(e)
  }
}
