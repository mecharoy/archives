/* Cold backup. The business should survive the phone going into a bucket of
   water and the person who built the app going quiet for six months, so the
   whole ledger writes out as one plain file that opens in any spreadsheet. */

import { dbAll } from './db'
import { getState } from './store'
import { SHEET_COLUMNS } from './model'
import type { AnyMaster, Entry } from './model'
import { isoDate } from './bn'

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

const TAB_OF: Record<string, string> = {
  project: 'Projects', worker: 'Workers', item: 'Items', party: 'Parties', stage: 'Stages', coeff: 'Coefficients',
  day: 'Day', attendance: 'Attendance', stock: 'Stock', money: 'Money', progress: 'Progress',
}

/** One file, every tab, each headed by its name — readable by a human and by
    Excel, which is the point. */
export async function buildCsv(): Promise<string> {
  const masters = await dbAll<AnyMaster>('masters')
  const entries = await dbAll<Entry>('entries')
  const rows: Record<string, Record<string, unknown>[]> = {}
  for (const m of [...masters, ...entries] as unknown as Record<string, unknown>[]) {
    const tab = TAB_OF[String(m.kind)]
    if (!tab) continue
    ;(rows[tab] ||= []).push(m)
  }
  const out: string[] = []
  for (const [tab, cols] of Object.entries(SHEET_COLUMNS)) {
    out.push(`# ${tab}`)
    out.push(cols.join(','))
    for (const r of rows[tab] || []) out.push(cols.map((c) => csvCell(r[c])).join(','))
    out.push('')
  }
  return out.join('\n')
}

export async function buildJson(): Promise<string> {
  const s = getState()
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    app: 'site-khata',
    masters: await dbAll('masters'),
    entries: await dbAll('entries'),
    settings: { ...s.settings, token: '', briefToken: '', pin_hash: '' },
  }, null, 1)
}

export interface SaveResult { ok: boolean; where: string }

/** Writes to the phone's Documents folder where a file manager can find it;
    falls back to a browser download when running in a desktop browser. */
export async function saveFile(name: string, text: string, mime: string): Promise<SaveResult> {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({ path: name, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })
    return { ok: true, where: 'Documents / ' + name }
  } catch {
    try {
      const blob = new Blob([text], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      return { ok: true, where: name }
    } catch {
      return { ok: false, where: '' }
    }
  }
}

export const backupName = (ext: string) => `site-khata-${isoDate()}.${ext}`
