/* Local derivations.
   The app never shows a number it invented — but it does need numbers when
   the nightly brief is missing or stale, and it needs them to pre-fill the
   wizard. Everything here is a plain sum over entries he himself made, and
   the dashboard labels it as the phone's own arithmetic, not the Sheet's. */

import type { Entry, AttendanceEntry, StockEntry, MoneyEntry, ProgressEntry, DayEntry, Project, Stage, Coeff, Item, ID } from './model'
import { isoDate, addDays } from './bn'
import { t } from './i18n'

export const DRAWING_HEAD = 'ব্যবসা থেকে নেওয়া'

export function reversedIds(entries: Entry[]): Set<ID> {
  const s = new Set<ID>()
  for (const e of entries) if (e.reverses) s.add(e.reverses)
  return s
}

/** Live rows: reversal pairs cancel out arithmetically, so for sums keep
    everything; for "the latest state of X" queries drop both sides. */
export function liveEntries(entries: Entry[]): Entry[] {
  const rev = reversedIds(entries)
  return entries.filter((e) => !e.reverses && !rev.has(e.id))
}

const byKind = <K extends Entry['kind']>(entries: Entry[], k: K) =>
  entries.filter((e) => e.kind === k) as Extract<Entry, { kind: K }>[]

export interface ProjectTotals {
  project_id: ID
  labour: number
  material: number
  other: number
  cost: number
  received: number
  pct_done: number
  pct_spent: number
  earned: number
  cpi: number | null
  at_finish: number | null
  profit: number | null
  status: 'ok' | 'warn' | 'crit'
  flag_bn: string
}

export function projectTotals(p: Project, entries: Entry[], stages: Stage[]): ProjectTotals {
  const mine = entries.filter((e) => e.project_id === p.id)
  const labour = byKind(mine, 'attendance').reduce((a, e) => a + (e.amount || 0), 0)
  const material = byKind(mine, 'stock')
    .filter((e) => e.dir === 'in' || e.dir === 'transfer')
    .reduce((a, e) => a + (e.amount || 0), 0)
  const money = byKind(mine, 'money').filter((e) => !e.personal)
  const other = money.filter((e) => e.dir === 'paid').reduce((a, e) => a + (e.amount || 0), 0)
  const received = money.filter((e) => e.dir === 'received').reduce((a, e) => a + (e.amount || 0), 0)
  const cost = labour + material + other
  const pct_done = projectPct(p, entries, stages)
  const budget = p.budget || 0
  const pct_spent = budget > 0 ? (cost / budget) * 100 : 0
  const earned = (pct_done / 100) * budget
  const cpi = cost > 0 && budget > 0 ? earned / cost : null
  const at_finish = pct_done > 2 ? cost / (pct_done / 100) : null
  const profit = at_finish != null && budget > 0 ? budget - at_finish : null

  let status: ProjectTotals['status'] = 'ok'
  let flag_bn = t('ঠিক আছে')
  const gap = pct_spent - pct_done
  if (budget > 0 && gap > 15) { status = 'crit'; flag_bn = t('খরচ কাজের অনেক আগে') }
  else if (budget > 0 && gap > 6) { status = 'warn'; flag_bn = t('খরচ কাজের থেকে এগিয়ে') }
  else if (budget > 0 && gap < -10) { flag_bn = t('খরচ কম, কাজ এগিয়ে') }

  return { project_id: p.id, labour, material, other, cost, received, pct_done, pct_spent, earned, cpi, at_finish, profit, status, flag_bn }
}

/** Percent from stage weights, never a guess he typed. */
export function projectPct(p: Project, entries: Entry[], stages: Stage[]): number {
  const st = stagesFor(p, stages)
  if (!st.length) return 0
  const total = st.reduce((a, s) => a + s.weight, 0) || 100
  const live = liveEntries(entries).filter((e) => e.kind === 'progress' && e.project_id === p.id) as ProgressEntry[]
  const best = new Map<number, 'half' | 'done'>()
  for (const e of live) {
    const cur = best.get(e.stage_seq)
    if (cur === 'done') continue
    if (cur === 'half' && e.state === 'half') continue
    best.set(e.stage_seq, e.state)
  }
  let done = 0
  for (const s of st) {
    const state = best.get(s.seq)
    if (state === 'done') done += s.weight
    else if (state === 'half') done += s.weight / 2
  }
  return Math.min(100, (done / total) * 100)
}

export function stagesFor(p: Project, stages: Stage[]): Stage[] {
  return stages.filter((s) => s.project_type === p.ptype).sort((a, b) => a.seq - b.seq)
}

/** The stage he is on and the one after it — the wizard shows only these two. */
export function currentStage(p: Project, entries: Entry[], stages: Stage[]) {
  const st = stagesFor(p, stages)
  const live = liveEntries(entries).filter((e) => e.kind === 'progress' && e.project_id === p.id) as ProgressEntry[]
  const done = new Set<number>()
  const half = new Set<number>()
  for (const e of live) (e.state === 'done' ? done : half).add(e.stage_seq)
  const cur = st.find((s) => !done.has(s.seq)) || st[st.length - 1]
  const next = cur ? st.find((s) => s.seq > cur.seq) : undefined
  return { stages: st, current: cur, next, isHalf: cur ? half.has(cur.seq) : false, doneSeqs: done }
}

/* ---- cash ---- */

export interface CashState {
  anchor_date: string
  anchor_amount: number
  computed: number
  in_since: number
  out_since: number
}

/** Cash is rebuilt from the last physical count, not from an opening balance
    typed once in March. A wrong count fixes itself the next time he counts. */
export function cashState(entries: Entry[], openingAmount: number, openingDate: string): CashState {
  const days = liveEntries(entries).filter((e) => e.kind === 'day' && (e as DayEntry).cash_counted != null) as DayEntry[]
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1))
  const last = days[days.length - 1]
  const anchor_date = last ? last.date : openingDate
  const anchor_amount = last ? (last.cash_counted as number) : openingAmount

  let inc = 0
  let out = 0
  for (const e of entries) {
    if (e.date <= anchor_date) continue
    if (e.kind === 'attendance') { out += (e.amount || 0) + (e.advance || 0); continue }
    if (e.kind === 'stock') {
      const s = e as StockEntry
      if ((s.dir === 'in' || s.dir === 'transfer') && s.paid && isCash(s)) out += s.amount || 0
      if (s.dir === 'sale' && s.paid) inc += s.amount || 0
      continue
    }
    if (e.kind === 'money') {
      const m = e as MoneyEntry
      if (m.personal) {
        if (m.head_bn === DRAWING_HEAD) out += m.amount || 0   // money leaving the business
        continue
      }
      if (m.mode !== 'নগদ') continue
      if (m.dir === 'received') inc += m.amount || 0
      else out += m.amount || 0
    }
  }
  return { anchor_date, anchor_amount, computed: anchor_amount + inc - out, in_since: inc, out_since: out }
}

function isCash(_s: StockEntry): boolean { return true }

/* ---- dues ---- */

export interface Due { party_id: ID; date: string; due_date: string; amount: number; item_id: ID; entry_id: ID }

export function openDues(entries: Entry[]): Due[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]
  return stock
    .filter((s) => (s.dir === 'in' || s.dir === 'transfer') && !s.paid && (s.amount || 0) > 0)
    .map((s) => ({ party_id: s.party_id, date: s.date, due_date: s.due_date || s.date, amount: s.amount, item_id: s.item_id, entry_id: s.id }))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
}

export function duesSplit(entries: Entry[]) {
  const all = openDues(entries)
  const today = isoDate()
  const week = addDays(today, 7)
  const overdue = all.filter((d) => d.due_date < today).reduce((a, d) => a + d.amount, 0)
  const thisWeek = all.filter((d) => d.due_date >= today && d.due_date <= week).reduce((a, d) => a + d.amount, 0)
  const total = all.reduce((a, d) => a + d.amount, 0)
  return { all, overdue, thisWeek, total }
}

/* ---- stock ---- */

export interface StockLevel { item_id: ID; qty: number; value: number; rate: number }

/** Shop stock: bought in without a project, less sales and transfers out. */
export function shopStock(entries: Entry[], items: Item[]): StockLevel[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]
  const map = new Map<ID, { qty: number; rate: number }>()
  const anchors = new Map<ID, string>()
  for (const s of stock) if (s.dir === 'count' && !s.project_id) {
    const prev = anchors.get(s.item_id)
    if (!prev || s.date >= prev) { anchors.set(s.item_id, s.date); map.set(s.item_id, { qty: s.qty, rate: s.rate || 0 }) }
  }
  for (const s of stock) {
    if (s.project_id && s.dir !== 'transfer') continue
    const anchor = anchors.get(s.item_id)
    if (anchor && s.date <= anchor) continue
    const cur = map.get(s.item_id) || { qty: 0, rate: 0 }
    if (s.dir === 'in' && !s.project_id) { cur.qty += s.qty; cur.rate = s.rate || cur.rate }
    else if (s.dir === 'sale') cur.qty -= s.qty
    else if (s.dir === 'transfer') cur.qty -= s.qty
    map.set(s.item_id, cur)
  }
  return items
    .map((it) => {
      const c = map.get(it.id)
      const rate = c?.rate || it.last_rate || 0
      return { item_id: it.id, qty: c?.qty || 0, rate, value: (c?.qty || 0) * rate }
    })
    .filter((l) => Math.abs(l.qty) > 1e-9)
}

/** Material burn on a project: consumed against the coefficient estimate. */
export interface Burn { item_id: ID; used: number; est: number; pct: number; status: 'ok' | 'warn' | 'crit' }

export function projectBurn(p: Project, entries: Entry[], coeffs: Coeff[], pctDone: number): Burn[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock' && e.project_id === p.id) as StockEntry[]
  const used = new Map<ID, number>()
  for (const s of stock) if (s.dir === 'in' || s.dir === 'transfer') used.set(s.item_id, (used.get(s.item_id) || 0) + s.qty)
  const area = p.area_sqft || 0
  const out: Burn[] = []
  for (const [item_id, qty] of used) {
    const c = coeffs.find((x) => x.project_type === p.ptype && x.item_id === item_id)
    const est = c && area > 0 ? c.per_sqft * area : 0
    const pct = est > 0 ? (qty / est) * 100 : 0
    const gap = pct - pctDone
    const status: Burn['status'] = est <= 0 ? 'ok' : gap > 20 ? 'crit' : gap > 8 ? 'warn' : 'ok'
    out.push({ item_id, used: qty, est, pct, status })
  }
  return out.sort((a, b) => b.pct - a.pct)
}

/* ---- activity ---- */

export function entriesInLastDays(entries: Entry[], n: number): number {
  const from = addDays(isoDate(), -(n - 1))
  const batches = new Set<string>()
  for (const e of entries) if (e.date >= from) batches.add(e.batch)
  return batches.size
}

export function lastEntryDate(entries: Entry[]): string | null {
  let best: string | null = null
  for (const e of entries) if (!best || e.date > best) best = e.date
  return best
}

/** The day's own numbers, for the review screen and the receipt. */
export function batchSummary(entries: Entry[], batch: string) {
  const rows = entries.filter((e) => e.batch === batch)
  const wages = (byKind(rows, 'attendance') as AttendanceEntry[]).reduce((a, e) => a + e.amount + e.advance, 0)
  const material = (byKind(rows, 'stock') as StockEntry[]).reduce((a, e) => a + (e.dir === 'in' || e.dir === 'transfer' ? e.amount : 0), 0)
  const other = (byKind(rows, 'money') as MoneyEntry[]).filter((e) => e.dir === 'paid').reduce((a, e) => a + e.amount, 0)
  return { wages, material, other, total: wages + material + other }
}
