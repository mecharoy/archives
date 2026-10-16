/* Factory reset — wipe the phone, and optionally the server copy with it.

   This is the one operation in the app that destroys instead of appending, so
   it is the one operation behind a code. The code is checked by the Worker,
   which holds it as a secret (RESET_CODE). The app carries NO copy and no hash
   of it: it used to carry a hash, and a hash of a six-digit code inside a
   public APK is worked out in about a second, which made the code decoration.

   So a reset needs the server to say yes (its `dry` check, for a phone-only
   reset, or the real wipe). With no server set up at all there is nothing to
   check a code against, so the phone asks him to type the words instead.

   Nothing about it is recoverable once the online copy is gone. Wiping only
   the phone is: the online ledger brings everything back. */

import { dbClear } from './db'
import { getState, apiUrl } from './store'

/** What he types on a phone with no server, where there is no code to check. */
export const CONFIRM_WORDS = 'মুছে দিন'

export interface ResetResult { phone: boolean; server: 'done' | 'skipped' | 'failed'; error: string }

/** True when there is a server that can check the code. */
export function hasServer(): boolean {
  const s = getState()
  return !!(apiUrl('/wipe') && s.settings.token)
}

/** Wipe this phone, and the household on the server when asked to. */
export async function factoryReset(code: string, alsoServer: boolean): Promise<ResetResult> {
  const s = getState()
  let server: ResetResult['server'] = 'skipped'

  if (hasServer()) {
    try {
      const res = await fetch(apiUrl('/wipe'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        // dry: the server checks the code and, if it is right, says so without deleting. The real wipe is the same call without it.
        body: JSON.stringify({ token: s.settings.token, code: code.trim(), dry: !alsoServer }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (res.status === 403) return { phone: false, server: 'skipped', error: 'কোড মিলল না' }
      if (!(res.ok && data.ok)) return { phone: false, server: 'failed', error: data.error || `সার্ভার ${res.status}` }
      server = alsoServer ? 'done' : 'skipped'
    } catch {
      // The code can only be checked by the server, so without signal nothing is wiped.
      return { phone: false, server: 'failed', error: 'নেট ছাড়া মোছা যায় না — কোডটা সার্ভার মেলায়' }
    }
  } else if (code.trim() !== CONFIRM_WORDS) {
    return { phone: false, server: 'skipped', error: 'কোড মিলল না' }
  }

  // The phone goes last: if the server refused, he still has his rows and can try again.
  await Promise.all([dbClear('kv'), dbClear('masters'), dbClear('entries'), dbClear('outbox'), dbClear('blobs')])
  return { phone: true, server, error: '' }
}
