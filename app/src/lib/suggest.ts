/* The suggestion engine.
   This is the whole user experience: without dictation, the only thing that
   keeps a day's entry under ninety seconds is guessing right. Every guess
   here is drawn from what he himself has entered — nothing is seeded from a
   template, and nothing comes from a server. */

import type { Entry, StockEntry, MoneyEntry, AttendanceEntry, ID, Presence } from './model'
import { liveEntries } from './calc'
import { isoDate, daysBetween } from './bn'

const HALFLIFE = 21 // days — a thing bought twice last week beats one bought forty times last year

function weight(date: string, today = isoDate()): number {
  const age = Math.max(0, daysBetween(date, today))
  return Math.pow(0.5, age / HALFLIFE)
}

function rank<T>(rows: { key: T; date: string; n?: number }[]): { key: T; score: number }[] {
  const m = new Map<T, number>()
  for (const r of rows) m.set(r.key, (m.get(r.key) || 0) + weight(r.date) * (r.n ?? 1))
  return [...m.entries()].map(([key, score]) => ({ key, score })).sort((a, b) => b.score - a.score)
}

/** Items he buys, best first. Same-project history counts double. */
export function rankItems(entries: Entry[], projectId: ID | ''): ID[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]
  const rows = stock
    .filter((s) => s.dir === 'in' || s.dir === 'transfer' || s.dir === 'sale')
    .map((s) => ({ key: s.item_id, date: s.date, n: projectId && s.project_id === projectId ? 2 : 1 }))
  return rank(rows).map((r) => r.key)
}

export function rankHeads(entries: Entry[], personal: boolean): string[] {
  const money = liveEntries(entries).filter((e) => e.kind === 'money') as MoneyEntry[]
  const rows = money
    .filter((m) => m.personal === personal && m.dir === 'paid')
    .map((m) => ({ key: m.head_bn, date: m.date }))
  return rank(rows).map((r) => r.key)
}

export function rankParties(entries: Entry[], itemId?: ID): ID[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]
  const rows = stock
    .filter((s) => s.party_id && (s.dir === 'in' || s.dir === 'transfer'))
    .filter((s) => !itemId || s.item_id === itemId)
    .map((s) => ({ key: s.party_id, date: s.date }))
  return rank(rows).map((r) => r.key)
}

export interface LastPurchase { rate: number; party_id: ID | ''; qty: number; date: string }

export function lastPurchase(entries: Entry[], itemId: ID): LastPurchase | null {
  const stock = (liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[])
    .filter((s) => s.item_id === itemId && (s.dir === 'in' || s.dir === 'transfer') && s.rate > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1))
  const s = stock[0]
  return s ? { rate: s.rate, party_id: s.party_id, qty: s.qty, date: s.date } : null
}

/** The quantities he actually orders, most common first. Chips, not a keypad. */
export function qtyChips(entries: Entry[], itemId: ID, max = 4): number[] {
  const stock = (liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[])
    .filter((s) => s.item_id === itemId && s.qty > 0)
  return rank(stock.map((s) => ({ key: s.qty, date: s.date })))
    .slice(0, max)
    .map((r) => r.key)
}

export function amountChips(entries: Entry[], head: string, personal: boolean, max = 4): number[] {
  const money = (liveEntries(entries).filter((e) => e.kind === 'money') as MoneyEntry[])
    .filter((m) => m.head_bn === head && m.personal === personal && m.amount > 0)
  return rank(money.map((m) => ({ key: m.amount, date: m.date })))
    .slice(0, max)
    .map((r) => r.key)
}

/** Yesterday's men, so screen two starts already ticked. */
export function lastAttendance(entries: Entry[], projectId: ID): Map<ID, Presence> {
  const att = (liveEntries(entries).filter((e) => e.kind === 'attendance') as AttendanceEntry[])
    .filter((a) => a.project_id === projectId && a.days > 0)
  if (!att.length) return new Map()
  const lastDate = att.reduce((a, b) => (a > b.date ? a : b.date), '')
  const out = new Map<ID, Presence>()
  for (const a of att) if (a.date === lastDate) out.set(a.worker_id, a.presence)
  return out
}

export function lastDayFor(entries: Entry[], projectId: ID): string | null {
  const rows = entries.filter((e) => e.project_id === projectId)
  if (!rows.length) return null
  return rows.reduce((a, b) => (a > b.date ? a : b.date), '')
}

/** Projects he touched most recently, so the first screen is one tap. */
export function rankProjects(entries: Entry[], ids: ID[]): ID[] {
  const rows = entries.filter((e) => e.project_id).map((e) => ({ key: e.project_id as ID, date: e.date }))
  const scored = new Map(rank(rows).map((r) => [r.key, r.score]))
  return [...ids].sort((a, b) => (scored.get(b) || 0) - (scored.get(a) || 0))
}

/* ---- screens that demote themselves ----
   If a screen has been answered "nothing" for seven straight days it stops
   being a step and becomes a button at the end. The wizard he uses in month
   three should be shorter than the one he started with. */

export type DemotableScreen = 'material' | 'expense' | 'progress'

export function screenDemoted(entries: Entry[], screen: DemotableScreen, projectId: ID): boolean {
  const days = new Set<string>()
  for (const e of entries) if (e.project_id === projectId) days.add(e.date)
  const recent = [...days].sort().slice(-7)
  if (recent.length < 7) return false
  const kind: Entry['kind'] = screen === 'material' ? 'stock' : screen === 'expense' ? 'money' : 'progress'
  for (const e of liveEntries(entries)) {
    if (e.project_id !== projectId) continue
    if (e.kind !== kind) continue
    if (kind === 'money' && (e as MoneyEntry).personal) continue
    if (recent.includes(e.date)) return false
  }
  return true
}

/** How often he opens the full list instead of taking a chip. Over a third
    and the ranking is wrong — the plan says measure it, so we measure it. */
export interface ChipStats { taken: number; expanded: number }

export function chipMissRate(s: ChipStats): number | null {
  const total = s.taken + s.expanded
  return total < 10 ? null : s.expanded / total
}
