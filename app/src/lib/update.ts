/* Keeping the app current without anyone sending him a file.

   The repository publishes two things beside each other: the APK, and a small
   `latest.json` saying which build it is. The phone reads that file, compares
   the number with what is installed, and only if it is genuinely newer does it
   say anything at all. Nothing is downloaded on a whim and nothing is replaced
   behind his back — Android shows its own install screen and the last tap is
   his.

   Everything here fails silently. No network, a 404, a half-written JSON file,
   an old Android that will not allow it — every one of those ends with the app
   simply not mentioning an update, because a man entering his day's wages must
   never be interrupted by our infrastructure having a bad morning. */

import { getState, saveSettings, setState } from './store'
import { t } from './i18n'

/** Where the repository publishes the build. Overridable in settings. */
export const DEFAULT_MANIFEST =
  'https://raw.githubusercontent.com/mecharoy/archives/claude/app-development-apk-vlbobd/app/dist-apk/latest.json'

/** Don't ask GitHub more than twice a day. */
const EVERY_HOURS = 12

export interface Release {
  code: number          // build number; the only thing compared
  name: string          // what he sees, e.g. "1.0.4"
  url: string           // the APK
  size?: number         // bytes, for the prompt
  notes_bn?: string
  notes_en?: string
}

export interface Installed { code: number; name: string }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : '')

/* Everything below is a no-op off a phone. Asking the bridge for a native
   plugin in a browser does not return an error — it throws where nothing is
   waiting to catch it, which surfaces as a page error in an app that should
   simply have said nothing. So the question is asked once, first. */
export async function nativePlatform(): Promise<boolean> { return isNative() }

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function plugin() {
  const { registerPlugin } = await import('@capacitor/core')
  return registerPlugin<{
    current(): Promise<{ ok: boolean; code?: number; name?: string; error?: string }>
    canInstall(): Promise<{ value: boolean }>
    openInstallSettings(): Promise<void>
    install(o: { path: string }): Promise<void>
  }>('Updater')
}

/** What is installed. Null off a phone — the browser has no version. */
/* No call in the update check may hang the screen. A native bridge that never
   answers, or a fetch that never returns on a bad network, would otherwise
   leave the page saying "checking" for ever. So every await here is bounded:
   whatever has not answered in a few seconds is treated as "could not find
   out", which the page can show, rather than a spinner with no end. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) },
           (e) => { clearTimeout(timer); reject(e) })
  })
}

export async function installed(): Promise<Installed | null> {
  if (!(await isNative())) return null
  try {
    const res = await withTimeout((await plugin()).current(), 6000)
    if (!res?.ok || res.code == null) return null
    return { code: num(res.code), name: str(res.name, 20) || '—' }
  } catch {
    return null
  }
}

/** Read and whitelist the published manifest. A malformed one is no update. */
export async function fetchRelease(url = ''): Promise<Release | null> {
  const where = (url || getState().settings.update_url || DEFAULT_MANIFEST).trim()
  if (!where) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)
    const res = await withTimeout(fetch(where + (where.includes('?') ? '&' : '?') + 'v=' + Date.now(), {
      cache: 'no-store', signal: ctrl.signal,
    }), 16_000)
    clearTimeout(timer)
    if (!res.ok) return null
    const raw = (await res.json()) as Record<string, unknown>
    const code = num(raw.code)
    const apk = str(raw.url, 400)
    // A release without a build number or a file is not a release.
    if (code <= 0 || !/^https:\/\//.test(apk)) return null
    return {
      code,
      name: str(raw.name, 20) || String(code),
      url: apk,
      size: num(raw.size) || undefined,
      notes_bn: str(raw.notes_bn),
      notes_en: str(raw.notes_en),
    }
  } catch {
    return null
  }
}

export interface UpdateState { release: Release; from: Installed }

/**
 * Is there something newer? `force` skips the twice-a-day throttle, for the
 * row in Settings where he asked on purpose and deserves an answer.
 */
export async function checkForUpdate(force = false): Promise<UpdateState | null> {
  const s = getState()
  if (!force) {
    const last = s.settings.update_checked_at
    if (last && Date.now() - Date.parse(last) < EVERY_HOURS * 3600_000) return null
  }
  const here = await installed()
  if (!here) return null                       // not on a phone; nothing to update
  const there = await fetchRelease()
  await saveSettings({ update_checked_at: new Date().toISOString() })
  if (!there || there.code <= here.code) return null
  return { release: there, from: here }
}

/** Whether Android will let this app hand a file to the installer. */
export async function canInstall(): Promise<boolean> {
  if (!(await isNative())) return false
  try { return Boolean((await withTimeout((await plugin()).canInstall(), 6000)).value) } catch { return false }
}

export async function openInstallSettings(): Promise<void> {
  if (!(await isNative())) return
  try { await (await plugin()).openInstallSettings() } catch { /* nothing to do */ }
}

export type Stage = 'downloading' | 'opening' | 'done' | 'blocked' | 'failed'

/**
 * Download the build and hand it to Android.
 *
 * The file goes to the app's own cache, which the FileProvider already
 * exposes, so no storage permission is involved and the phone clears it on
 * its own if space runs short.
 */
export async function downloadAndInstall(
  release: Release,
  onStage: (stage: Stage, detail?: string) => void,
): Promise<void> {
  try {
    if (!(await isNative())) { onStage('failed', t('এটা ব্রাউজারে চলছে')); return }
    if (!(await canInstall())) { onStage('blocked'); return }

    onStage('downloading')
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const name = `SiteKhata-${release.code}.apk`
    const got = await Filesystem.downloadFile({
      url: release.url,
      path: name,
      directory: Directory.Cache,
    })
    const path = got.path || ''
    if (!path) { onStage('failed', t('ফাইলটা নামানো গেল না')); return }

    onStage('opening')
    await (await plugin()).install({ path })
    onStage('done')
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    onStage('failed', m && m !== 'undefined' ? m : t('কারণ জানা গেল না'))
  }
}

/** "৭.১ MB", for the prompt. */
export function sizeText(bytes?: number): string {
  if (!bytes) return ''
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/* Ask on every app open (and every resume), not twice a day. He wanted the
   phone to look for a new build each time he opens it, so this forces the
   check past the throttle and parks the answer in the store; the card on the
   home screen reads it from there. Off a phone, or when nothing is newer,
   the store simply holds null and the card draws nothing. */
export async function refreshUpdate(force = true): Promise<void> {
  try {
    const found = await checkForUpdate(force)
    setState({ update: found })
  } catch {
    /* a failed look is a look that never happened — never a visible error */
  }
}
