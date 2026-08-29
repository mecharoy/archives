/* Factory reset — wipe the phone, and optionally the server copy with it.

   This is the one operation in the app that destroys instead of appending, so
   it is the one operation behind a code. The code is not stored anywhere in
   plain text: the app carries its SHA-256 hash, and the Worker holds its own
   copy as a secret, so wiping the server needs the code even from a phone
   whose token has been pulled out of the APK.

   Nothing about it is recoverable. A backup written from সেটিংস → ব্যাকআপ is
   the only way back, which is why the screen offers one first. */

import { dbClear } from './db'
import { getState, apiUrl } from './store'

/* sha256('site-khata/reset/v1:' + code) — the code itself is never in the
   bundle, so unpacking the APK does not hand anyone the reset. */
const CODE_HASH = 'dc86066e089acf42d8598d770637d155e054bdffeb66b9e64aa843349d1fbefd'

export async function codeHash(code: string): Promise<string> {
  const data = new TextEncoder().encode('site-khata/reset/v1:' + code.trim())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function codeOk(code: string): Promise<boolean> {
  return (await codeHash(code)) === CODE_HASH
}

export interface ResetResult { phone: boolean; server: 'done' | 'skipped' | 'failed'; error: string }

/** Wipe this phone, and the household on the server when asked to. */
export async function factoryReset(code: string, alsoServer: boolean): Promise<ResetResult> {
  if (!(await codeOk(code))) return { phone: false, server: 'skipped', error: 'কোড মিলল না' }

  let server: ResetResult['server'] = 'skipped'
  let error = ''
  const s = getState()
  const url = apiUrl('/wipe')
  if (alsoServer && url && s.settings.token) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: s.settings.token, code: code.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (res.ok && data.ok) server = 'done'
      else { server = 'failed'; error = data.error || `সার্ভার ${res.status}` }
    } catch {
      server = 'failed'
      error = 'নেট পাওয়া যাচ্ছে না'
    }
  }

  // The phone goes last: if the server refused, he still has his rows and can
  // try again rather than being left with nothing anywhere.
  if (server !== 'failed') {
    await Promise.all([dbClear('kv'), dbClear('masters'), dbClear('entries'), dbClear('outbox'), dbClear('blobs')])
    return { phone: true, server, error }
  }
  return { phone: false, server, error }
}
