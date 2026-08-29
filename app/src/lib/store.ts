/* One store, no framework. Load everything from IndexedDB once at boot,
   keep it in memory, write through on every change. The dataset is a few
   thousand rows at most — a family business, not a warehouse. */

import { useSyncExternalStore } from 'react'
import { dbAll, dbPut, dbPutMany, kvGet, kvSet, uid } from './db'
import type { AnyMaster, Entry, Project, Worker, Item, Party, Stage, Coeff, ID, Bill } from './model'
import { rowForEntry, rowForMaster, COMMON_ITEM_ORDER } from './model'
import { isoDate } from './bn'
import { setLang, t, type Lang } from './i18n'
import type { RemindWhen } from './remind'

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
  toured: boolean
  update_url: string
  update_checked_at: string
  chips_taken: number
  chips_expanded: number
  theme: 'system' | 'light' | 'dark'
  text_scale: number
  lang: Lang
  remind: RemindWhen
  owner_bn: string
  runs_shop: boolean
  runs_sites: boolean
}

/* Baked in at build time so the phone syncs the moment it is installed —
   he never types a URL or a token. Left empty, the app is simply offline-only.
     VITE_SYNC_ENDPOINT=https://site-khata.you.workers.dev \
     VITE_SYNC_TOKEN=<device token> npm run apk                              */
const BUILT_IN_ENDPOINT = (import.meta.env.VITE_SYNC_ENDPOINT as string | undefined)?.trim() || ''
const BUILT_IN_TOKEN = (import.meta.env.VITE_SYNC_TOKEN as string | undefined)?.trim() || ''

export const DEFAULT_SETTINGS: Settings = {
  endpoint: BUILT_IN_ENDPOINT, token: BUILT_IN_TOKEN, briefUrl: '', briefToken: '',
  opening_cash: 0, opening_date: isoDate(), pin_hash: '',
  auto_sync: true, onboarded: false, toured: false, update_url: '', update_checked_at: '',
  chips_taken: 0, chips_expanded: 0,
  theme: 'system', text_scale: 1,
  lang: 'bn', remind: 'day', owner_bn: '', runs_shop: true, runs_sites: true,
}

export interface OutboxRow { id: ID; tab: string; mode: 'append' | 'upsert'; values: (string | number | boolean)[]; tries: number; last_error: string; created_at: string }

/* Every line the model writes comes in both languages: _bn is what his phone
   shows, _en is the same sentence for an English screen. English is optional
   everywhere — a brief written before this existed still renders, in Bengali. */
export interface Brief {
  generated_at: string
  headline_bn?: string
  headline_en?: string
  cards?: { label_bn: string; label_en?: string; value: string; sub_bn?: string; sub_en?: string; status?: Status }[]
  projects?: { name_bn: string; name_en?: string; pct_done: number; pct_spent: number; status?: Status; note_bn?: string; note_en?: string }[]
  alerts?: { severity: Status; text_bn: string; text_en?: string }[]
  series?: {
    scurve?: { days: number[]; plan: number[]; actual: number[]; unit?: string }
    burn?: { item_bn: string; item_en?: string; pct: number; status?: Status }[]
  }
  todo_bn?: string[]
  todo_en?: string[]
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

/** The server's base URL plus a path. One definition, so a stray slash can
    only ever be wrong in one place. */
export function apiUrl(path: string, base?: string): string {
  const root = (base ?? state.settings.endpoint).trim().replace(/\/+$/, '')
  return root ? root + path : ''
}

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
  // The language has to be live before the first render, not after it.
  setLang(state.settings.lang)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => setState({ online: true }))
    window.addEventListener('offline', () => setState({ online: false }))
  }
}

/* ---- selectors ---- */

/* Masters come back from IndexedDB in id order, and ids are random — so
   without a sort, the three chips he is offered on a fresh install are three
   arbitrary names. These orders decide nothing once he has history; they only
   make the first week sensible instead of a lottery. */
const COMMON = new Map(COMMON_ITEM_ORDER.map((n, i) => [n, i]))
const byName = (a: { name_bn: string }, b: { name_bn: string }) => a.name_bn.localeCompare(b.name_bn, 'bn')
const byCommon = (a: Item, b: Item) =>
  ((COMMON.get(a.name_bn) ?? 99) - (COMMON.get(b.name_bn) ?? 99)) || byName(a, b)

export const projects = (s: State) => s.masters.filter((m) => m.kind === 'project') as Project[]
export const activeProjects = (s: State) => projects(s).filter((p) => p.status === 'active')
export const workers = (s: State) => (s.masters.filter((m) => m.kind === 'worker') as Worker[]).filter((w) => w.active).sort(byName)
export const allWorkers = (s: State) => (s.masters.filter((m) => m.kind === 'worker') as Worker[]).sort(byName)
export const items = (s: State) => (s.masters.filter((m) => m.kind === 'item') as Item[]).filter((i) => i.active).sort(byCommon)
export const allItems = (s: State) => (s.masters.filter((m) => m.kind === 'item') as Item[]).sort(byCommon)
export const parties = (s: State) => (s.masters.filter((m) => m.kind === 'party') as Party[]).sort(byName)
export const stages = (s: State) => s.masters.filter((m) => m.kind === 'stage') as Stage[]
export const coeffs = (s: State) => s.masters.filter((m) => m.kind === 'coeff') as Coeff[]
/* Payments he knows are coming — rent, fees, a promise to a person. */
export const allBills = (s: State) => s.masters.filter((m) => m.kind === 'bill') as Bill[]

export function nameOf(s: State, id: ID): string {
  const m = s.masters.find((x) => x.id === id) as { name_bn?: string } | undefined
  return m?.name_bn ? t(m.name_bn) : '—'
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
  if (patch.lang) setLang(patch.lang)
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
