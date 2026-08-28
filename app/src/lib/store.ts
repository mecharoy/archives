/* One store, no framework. Load everything from IndexedDB once at boot,
   keep it in memory, write through on every change. The dataset is a few
   thousand rows at most — a family business, not a warehouse. */

import { useSyncExternalStore } from 'react'
import { dbAll, dbPut, dbPutMany, kvGet, kvSet, uid } from './db'
import type { AnyMaster, Entry, Project, Worker, Item, Party, Stage, Coeff, ID } from './model'
import { rowForEntry, rowForMaster } from './model'
import { isoDate } from './bn'

export interface Settings {
  endpoint: string
  token: string
  briefUrl: string
  briefToken: string
  opening_cash: number
  opening_date: string
  pin_hash: string
  auto_sync: boolean
  onboarded: boolean
  chips_taken: number
  chips_expanded: number
  theme: 'system' | 'light' | 'dark'
  text_scale: number
}

export const DEFAULT_SETTINGS: Settings = {
  endpoint: '', token: '', briefUrl: '', briefToken: '',
  opening_cash: 0, opening_date: isoDate(), pin_hash: '',
  auto_sync: true, onboarded: false, chips_taken: 0, chips_expanded: 0,
  theme: 'system', text_scale: 1,
}

export interface OutboxRow { id: ID; tab: string; mode: 'append' | 'upsert'; values: (string | number | boolean)[]; tries: number; last_error: string; created_at: string }

export interface Brief {
  generated_at: string
  headline_bn?: string
  cards?: { label_bn: string; value: string; sub_bn?: string; status?: Status }[]
  projects?: { name_bn: string; pct_done: number; pct_spent: number; status?: Status; note_bn?: string }[]
  alerts?: { severity: Status; text_bn: string }[]
  series?: {
    scurve?: { days: number[]; plan: number[]; actual: number[]; unit?: string }
    burn?: { item_bn: string; pct: number; status?: Status }[]
  }
  todo_bn?: string[]
}
export type Status = 'ok' | 'warn' | 'crit' | 'info'

export interface State {
  ready: boolean
  masters: AnyMaster[]
  entries: Entry[]
  outbox: OutboxRow[]
  settings: Settings
  brief: Brief | null
  brief_fetched_at: string | null
  syncing: boolean
  sync_error: string
  online: boolean
}

let state: State = {
  ready: false, masters: [], entries: [], outbox: [], settings: DEFAULT_SETTINGS,
  brief: null, brief_fetched_at: null, syncing: false, sync_error: '',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }
export function setState(patch: Partial<State>) { state = { ...state, ...patch }; emit() }
export function getState(): State { return state }

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => sel(state),
    () => sel(state)
  )
}

/* ---- boot ---- */

export async function boot() {
  const [masters, entries, outbox, settings, brief, brief_fetched_at] = await Promise.all([
    dbAll<AnyMaster>('masters'),
    dbAll<Entry>('entries'),
    dbAll<OutboxRow>('outbox'),
    kvGet<Settings>('settings', DEFAULT_SETTINGS),
    kvGet<Brief | null>('brief', null),
    kvGet<string | null>('brief_fetched_at', null),
  ])
  setState({
    ready: true,
    masters: masters.filter((m) => !m.deleted),
    entries: entries.sort((a, b) => (a.date < b.date ? -1 : 1)),
    outbox,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    brief, brief_fetched_at,
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => setState({ online: true }))
    window.addEventListener('offline', () => setState({ online: false }))
  }
}

/* ---- selectors ---- */

export const projects = (s: State) => s.masters.filter((m) => m.kind === 'project') as Project[]
export const activeProjects = (s: State) => projects(s).filter((p) => p.status === 'active')
export const workers = (s: State) => (s.masters.filter((m) => m.kind === 'worker') as Worker[]).filter((w) => w.active)
export const allWorkers = (s: State) => s.masters.filter((m) => m.kind === 'worker') as Worker[]
export const items = (s: State) => (s.masters.filter((m) => m.kind === 'item') as Item[]).filter((i) => i.active)
export const allItems = (s: State) => s.masters.filter((m) => m.kind === 'item') as Item[]
export const parties = (s: State) => s.masters.filter((m) => m.kind === 'party') as Party[]
export const stages = (s: State) => s.masters.filter((m) => m.kind === 'stage') as Stage[]
export const coeffs = (s: State) => s.masters.filter((m) => m.kind === 'coeff') as Coeff[]

export function nameOf(s: State, id: ID): string {
  const m = s.masters.find((x) => x.id === id) as { name_bn?: string } | undefined
  return m?.name_bn || '—'
}

/* ---- writes ---- */

export async function saveMaster(m: AnyMaster) {
  const row = { ...m, updated_at: new Date().toISOString() }
  await dbPut('masters', row)
  const rest = state.masters.filter((x) => x.id !== row.id)
  setState({ masters: row.deleted ? rest : [...rest, row] })
  await queue([rowForMaster(row)])
}

export async function saveEntries(entries: Entry[]) {
  if (!entries.length) return
  await dbPutMany('entries', entries)
  setState({ entries: [...state.entries, ...entries].sort((a, b) => (a.date < b.date ? -1 : 1)) })
  await queue(entries.map(rowForEntry))
}

export async function saveSettings(patch: Partial<Settings>) {
  const next = { ...state.settings, ...patch }
  await kvSet('settings', next)
  setState({ settings: next })
}

export async function queue(rows: { tab: string; mode: 'append' | 'upsert'; values: (string | number | boolean)[] }[]) {
  const out: OutboxRow[] = rows.map((r) => ({ ...r, id: uid(), tries: 0, last_error: '', created_at: new Date().toISOString() }))
  await dbPutMany('outbox', out)
  setState({ outbox: [...state.outbox, ...out] })
}

export function noteChip(taken: boolean) {
  const s = state.settings
  void saveSettings(taken ? { chips_taken: s.chips_taken + 1 } : { chips_expanded: s.chips_expanded + 1 })
}
