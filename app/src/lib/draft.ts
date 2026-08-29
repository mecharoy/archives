/* The day in progress.
   Held in IndexedDB from the first tap, so walking away halfway — a phone
   call, a truck arriving — costs nothing. Only the review screen's সেভ করুন
   turns it into entries; before that the ledger is untouched. */

import type { ID, Presence, Entry, DayEntry, AttendanceEntry, StockEntry, MoneyEntry, ProgressEntry } from './model'
import { kvGet, kvSet, kvDel, uid } from './db'
import { isoDate } from './bn'

export interface DraftAtt { presence: Presence; rate: number; amount: number; advance: number }
export interface DraftMat { key: string; item_id: ID; qty: number; rate: number; party_id: ID | ''; due_date: string; paid: boolean; photo_id: ID | '' }
export interface DraftExp { key: string; head_bn: string; amount: number; mode: string; note: string; photo_id: ID | '' }

export interface Draft {
  batch: ID
  date: string
  project_id: ID | ''
  att: Record<ID, DraftAtt>
  mats: DraftMat[]
  exps: DraftExp[]
  progress: { stage_seq: number; state: 'half' | 'done' } | null
  cash_counted: number | null
  cash_computed: number | null
  note: string
  step: number
  started_at: string
  from_yesterday: boolean
}

export const DAYS_FOR: Record<Presence, number> = { full: 1, half: 0.5, ot: 1.5 }

export function newDraft(date = isoDate(), project_id: ID | '' = ''): Draft {
  return {
    batch: uid(), date, project_id, att: {}, mats: [], exps: [], progress: null,
    cash_counted: null, cash_computed: null, note: '', step: 0,
    started_at: new Date().toISOString(), from_yesterday: false,
  }
}

const KEY = 'draft'
export const loadDraft = () => kvGet<Draft | null>(KEY, null)
export const saveDraft = (d: Draft) => kvSet(KEY, d)
export const clearDraft = () => kvDel(KEY)

export function draftIsEmpty(d: Draft): boolean {
  return !Object.keys(d.att).length && !d.mats.length && !d.exps.length && !d.progress && d.cash_counted == null
}

export function wageTotal(d: Draft): number {
  return Object.values(d.att).reduce((a, x) => a + x.amount + x.advance, 0)
}
export function matTotal(d: Draft): number {
  return d.mats.reduce((a, m) => a + m.qty * m.rate, 0)
}
export function expTotal(d: Draft): number {
  return d.exps.reduce((a, e) => a + e.amount, 0)
}
export function dayTotal(d: Draft): number {
  return wageTotal(d) + matTotal(d) + expTotal(d)
}

/** The only place a draft becomes ledger rows. Wages can be built here and
    nowhere else, which is what keeps them out of the Money tab. */
export function buildEntries(d: Draft): Entry[] {
  const now = new Date().toISOString()
  const base = { batch: d.batch, date: d.date, project_id: d.project_id, created_at: now }
  const out: Entry[] = []

  for (const [worker_id, a] of Object.entries(d.att)) {
    const days = DAYS_FOR[a.presence]
    out.push({ id: uid(), kind: 'attendance', ...base, worker_id, presence: a.presence, days, rate: a.rate, amount: a.amount, advance: a.advance } as AttendanceEntry)
  }
  for (const m of d.mats) {
    out.push({ id: uid(), kind: 'stock', ...base, item_id: m.item_id, dir: 'in', qty: m.qty, rate: m.rate, amount: round(m.qty * m.rate), party_id: m.party_id, due_date: m.due_date, paid: m.paid, photo_id: m.photo_id } as StockEntry)
  }
  for (const e of d.exps) {
    out.push({ id: uid(), kind: 'money', ...base, head_bn: e.head_bn, dir: 'paid', amount: e.amount, party_id: '', mode: e.mode, note: e.note, personal: false, photo_id: e.photo_id } as MoneyEntry)
  }
  if (d.progress) {
    out.push({ id: uid(), kind: 'progress', ...base, stage_seq: d.progress.stage_seq, state: d.progress.state, pct: 0 } as ProgressEntry)
  }
  out.push({ id: uid(), kind: 'day', ...base, cash_counted: d.cash_counted, cash_computed: d.cash_computed, note: d.note } as DayEntry)
  return out
}

const round = (n: number) => Math.round(n * 100) / 100

/** A correction is a mirrored row, never an edit. The Sheet stays append-only
    and the history of what he thought at the time survives. */
export function reversalOf(e: Entry): Entry {
  const now = new Date().toISOString()
  const common = { id: uid(), batch: e.batch, date: e.date, project_id: e.project_id, created_at: now, reverses: e.id }
  switch (e.kind) {
    case 'attendance':
      return { ...common, kind: 'attendance', worker_id: e.worker_id, presence: e.presence, days: -e.days, rate: e.rate, amount: -e.amount, advance: -e.advance } as AttendanceEntry
    case 'stock':
      return { ...common, kind: 'stock', item_id: e.item_id, dir: e.dir, qty: -e.qty, rate: e.rate, amount: -e.amount, party_id: e.party_id, due_date: e.due_date, paid: e.paid, photo_id: '' } as StockEntry
    case 'money':
      return { ...common, kind: 'money', head_bn: e.head_bn, dir: e.dir, amount: -e.amount, party_id: e.party_id, mode: e.mode, note: 'সংশোধন', personal: e.personal, photo_id: '' } as MoneyEntry
    case 'progress':
      return { ...common, kind: 'progress', stage_seq: e.stage_seq, state: e.state, pct: 0 } as ProgressEntry
    default:
      return { ...common, kind: 'day', cash_counted: null, cash_computed: null, note: 'সংশোধন' } as DayEntry
  }
}
