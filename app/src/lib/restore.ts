/* Pulling the ledger back down.
   This is what makes "recorded online" mean something: a phone that fell in a
   bucket is replaced, the app is installed, and one tap brings back every row
   the old phone had managed to send. Rows already on this phone are left
   alone — the id is the same on both sides, so a restore merges rather than
   overwrites. */

import { dbAll, dbPutMany } from './db'
import { SHEET_COLUMNS, type AnyMaster, type Entry } from './model'
import { apiUrl, getState, boot } from './store'
import { t, tf } from './i18n'

const KIND_OF_TAB: Record<string, string> = {
  Projects: 'project', Workers: 'worker', Items: 'item', Parties: 'party',
  Stages: 'stage', Coefficients: 'coeff',
  Day: 'day', Attendance: 'attendance', Stock: 'stock', Money: 'money', Progress: 'progress',
}
const MASTER_TABS = new Set(['Projects', 'Workers', 'Items', 'Parties', 'Stages', 'Coefficients'])
const BOOLS = new Set(['paid', 'personal', 'active'])
const NUMBERS = new Set([
  'amount', 'qty', 'rate', 'days', 'advance', 'weight', 'per_sqft', 'budget',
  'area_sqft', 'plan_days', 'seq', 'stage_seq', 'pct', 'terms_days', 'last_rate',
  'cash_counted', 'cash_computed',
])
/* Columns that mean "nothing here" rather than "zero" when they come back empty. */
const NULLABLE = new Set(['area_sqft', 'budget', 'plan_days', 'last_rate', 'cash_counted', 'cash_computed'])

export interface RestoreResult { masters: number; entries: number; error: string }

export async function restoreFromServer(): Promise<RestoreResult> {
  const s = getState()
  const url = apiUrl('/pull')
  if (!url || !s.settings.token) return { masters: 0, entries: 0, error: t('সেটিংসে ঠিকানা দেওয়া নেই') }

  let data: { ok?: boolean; error?: string; tables?: Record<string, unknown[][]> }
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + s.settings.token }, cache: 'no-store' })
    if (!res.ok) return { masters: 0, entries: 0, error: res.status === 401 ? t('টোকেন মিলল না') : tf('সার্ভার {0}', res.status) }
    data = await res.json()
  } catch {
    return { masters: 0, entries: 0, error: t('নেট পাওয়া যাচ্ছে না') }
  }
  if (!data.ok || !data.tables) return { masters: 0, entries: 0, error: data.error || t('উত্তর বোঝা গেল না') }

  const haveMasters = new Set((await dbAll<AnyMaster>('masters')).map((m) => m.id))
  const haveEntries = new Set((await dbAll<Entry>('entries')).map((e) => e.id))

  const masters: AnyMaster[] = []
  const entries: Entry[] = []

  for (const [tab, rows] of Object.entries(data.tables)) {
    const cols = SHEET_COLUMNS[tab]
    const kind = KIND_OF_TAB[tab]
    if (!cols || !kind || !Array.isArray(rows)) continue
    const isMaster = MASTER_TABS.has(tab)

    for (const values of rows) {
      if (!Array.isArray(values)) continue
      const rec: Record<string, unknown> = { kind }
      cols.forEach((c, i) => { rec[c] = decode(c, values[i]) })
      const id = String(rec.id || '')
      if (!id) continue

      if (isMaster) {
        if (haveMasters.has(id)) continue
        if (!rec.updated_at) rec.updated_at = new Date().toISOString()
        masters.push(rec as unknown as AnyMaster)
      } else {
        if (haveEntries.has(id)) continue
        rec.synced = true
        entries.push(rec as unknown as Entry)
      }
    }
  }

  await dbPutMany('masters', masters)
  await dbPutMany('entries', entries)
  await boot()
  return { masters: masters.length, entries: entries.length, error: '' }
}

function decode(col: string, v: unknown): unknown {
  if (BOOLS.has(col)) return v === 1 || v === true || v === '1' || v === 'true'
  if (NUMBERS.has(col)) {
    if (v === null || v === undefined || v === '') return NULLABLE.has(col) ? null : 0
    const n = Number(v)
    return Number.isFinite(n) ? n : NULLABLE.has(col) ? null : 0
  }
  return v == null ? '' : String(v)
}
