/* Local derivations.
   The app never shows a number it invented — but it does need numbers when
   the nightly brief is missing or stale, and it needs them to pre-fill the
   wizard. Everything here is a plain sum over entries he himself made, and
   the dashboard labels it as the phone's own arithmetic, not the Sheet's. */

import type { Entry, AttendanceEntry, StockEntry, StockDir, MoneyEntry, ProgressEntry, DayEntry, Project, Stage, Coeff, Item, ID } from './model'
import { isoDate, addDays } from './bn'
import { t } from './i18n'

export const DRAWING_HEAD = 'ব্যবসা থেকে নেওয়া'
/* Settling an old bill is not a new expense — the goods were counted the day
   they arrived. This head keeps that payment out of every cost total while
   still moving the cash. */
export const SETTLE_HEAD = 'বাকি মেটানো'
/* An old balance from the paper khata (see model.ts StockDir). Two dirs of their own, so every sum
   that asks for 'in' or 'sale' leaves them out without being told; only the dues below read them. */
/* Money a customer paid him for a job — an advance, a stage payment. Not SETTLE_HEAD, which every job
   total skips: this is the job's own income, and the job's "received" is built from it. */
export const JOB_PAY_HEAD = 'কাজের টাকা'
export const OPENING_GET = 'opening_get'
export const OPENING_OWE = 'opening_owe'

export function reversedIds(entries: Entry[]): Set<ID> {
  const s = new Set<ID>()
  for (const e of entries) if (e.reverses) s.add(e.reverses)
  return s
}

/** Drops both halves of every reversal pair — the cancelled row and the row
    that cancelled it. Use this for "the latest state of X" questions, where a
    cancelled row must not win. Do NOT use it for sums: a reversal carries a
    negative amount, so summing the raw entries already nets to the right
    figure, and filtering here would double-count the correction. */
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
  /* Whole paise. A row and the row that cancels it add to 0.0000000000004, not
     to 0, and a job with that much "cost" and no work done has a cost-per-work
     of exactly 0 — which painted a job that had spent nothing red. */
  const labour = paise(byKind(mine, 'attendance').reduce((a, e) => a + (e.amount || 0), 0))
  const material = paise(byKind(mine, 'stock')
    .filter((e) => e.dir === 'in' || e.dir === 'transfer')
    .reduce((a, e) => a + (e.amount || 0), 0))
  const money = byKind(mine, 'money').filter((e) => !e.personal && e.head_bn !== SETTLE_HEAD)
  const other = paise(money.filter((e) => e.dir === 'paid').reduce((a, e) => a + (e.amount || 0), 0))
  const received = paise(money.filter((e) => e.dir === 'received').reduce((a, e) => a + (e.amount || 0), 0))
  const cost = paise(labour + material + other)
  const pct_done = projectPct(p, entries, stages)
  const budget = p.budget || 0
  const pct_spent = budget > 0 ? (cost / budget) * 100 : 0
  const earned = (pct_done / 100) * budget
  /* Cost-per-work needs some work to compare against. Before a stage is marked, earned is 0 and
     cpi is 0 for the very first wage paid — which painted every new job red on its first day.
     The same 2% gate as at_finish. */
  const cpi = cost > 0 && budget > 0 && pct_done > 2 ? earned / cost : null
  const at_finish = pct_done > 2 ? cost / (pct_done / 100) : null
  const profit = at_finish != null && budget > 0 ? budget - at_finish : null

  /* The same rule as nightly/compute.mjs projectStatus, which colours the
     card on the brief — so a job is never red on one screen and green on the
     next. Spending ahead of the work, or work that has cost more than it
     earned (CPI under 1), is the warning; well ahead / CPI under 0.9 is red. */
  let status: ProjectTotals['status'] = 'ok'
  let flag_bn = t('ঠিক আছে')
  /* "Spending is ahead of the work" is only a statement when the work is being measured. A job with no
     stages can never show progress, so every rupee would read as "ahead". */
  const measured = stagesFor(p, stages).length > 0
  const gap = measured ? pct_spent - pct_done : 0
  if (budget > 0 && (gap > 15 || (cpi != null && cpi < 0.9))) { status = 'crit'; flag_bn = t('খরচ কাজের অনেক আগে') }
  else if (budget > 0 && (gap > 6 || (cpi != null && cpi < 1))) { status = 'warn'; flag_bn = t('খরচ কাজের থেকে এগিয়ে') }
  else if (budget > 0 && gap < -10) { flag_bn = t('খরচ কম, কাজ এগিয়ে') }

  return { project_id: p.id, labour, material, other, cost, received, pct_done, pct_spent, earned, cpi, at_finish, profit, status, flag_bn }
}

/* A row and the row that cancels it are both on the same job, so the job's own
   progress rows can be picked out first and the cancelled pairs dropped from
   that short list — rather than sorting out every row in the ledger once per job. */
const liveProgress = (entries: Entry[], p: Project) =>
  liveEntries(entries.filter((e) => e.kind === 'progress' && e.project_id === p.id)) as ProgressEntry[]

/** Percent from stage weights, never a guess he typed. */
export function projectPct(p: Project, entries: Entry[], stages: Stage[]): number {
  const st = stagesFor(p, stages)
  if (!st.length) return 0
  const total = st.reduce((a, s) => a + s.weight, 0) || 100
  const live = liveProgress(entries, p)
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
  const live = liveProgress(entries, p)
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
  /* A cancelled row and the row that cancelled it are both left out: the money never moved, and a row
     and its mirror added in floating point leave 0.0000000000004 behind. */
  const live = liveEntries(entries)
  const days = live.filter((e) => e.kind === 'day' && (e as DayEntry).cash_counted != null) as DayEntry[]
  days.sort(inOrder)
  const last = days[days.length - 1]
  const anchor_date = last ? last.date : openingDate
  const anchor_amount = last ? (last.cash_counted as number) : openingAmount

  /* What the count already includes. A count made at the end of a day includes that day — everything
     written up to the moment of the count, which is the whole of its own batch (they share an instant).
     What is written later the SAME day, a payment after he counted, is new. The opening balance is the
     cash at the START of its day, so that day's own rows count against it. */
  const inside = (e: Entry) => (last
    ? e.date < last.date || (e.date === last.date && e.created_at <= last.created_at)
    : e.date < openingDate)

  let inc = 0
  let out = 0
  for (const e of live) {
    if (inside(e)) continue
    if (e.kind === 'attendance') { out += (e.amount || 0) + (e.advance || 0); continue }
    if (e.kind === 'stock') {
      const s = e as StockEntry
      // Only buying moves cash. Sending goods from the shop to a site (and
      // taking them back) is the same goods changing hands inside his own
      // business — nothing leaves his pocket, so nothing is taken from the till.
      if (s.dir === 'in' && s.paid) out += s.amount || 0
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

/* ---- dues ---- */

/* due_date is '' when nobody gave one (a new shop whose terms he does not know). Such a bill is owed, and
   is cleared in the order it was written, but it is never overdue and never "due this week". */
export interface Due { party_id: ID; date: string; due_date: string; amount: number; item_id: ID; entry_id: ID; created_at: string; dir: StockDir }
export const isLate = (d: { due_date: string }, today = isoDate()) => !!d.due_date && d.due_date < today

/* A due is opened by an unpaid row and closed by a payment to that party —
   never by editing the original row, which stays exactly as it was written.
   Payments land on the oldest due first, the way a shopkeeper actually
   settles: last month's bill before this week's. */
const SETTLED = (entries: Entry[], dir: 'paid' | 'received') => {
  const money = liveEntries(entries).filter((e) => e.kind === 'money') as MoneyEntry[]
  const byParty = new Map<ID, number>()
  for (const m of money) {
    if (m.personal || m.head_bn !== SETTLE_HEAD || m.dir !== dir) continue
    byParty.set(m.party_id, paise((byParty.get(m.party_id) || 0) + (m.amount || 0)))
  }
  return byParty
}

function netted(rows: Due[], paid: Map<ID, number>): Due[] {
  const left = new Map(paid)
  const out: Due[] = []
  for (const d of rows) {
    let amount = d.amount
    const pot = left.get(d.party_id) || 0
    if (pot > 0) {
      const used = Math.min(pot, amount)
      // Whole paise: 21941.20 − 21940.70 is 0.5000000000014 in floating point, and "50 paise or less counts as paid" must not depend on that.
      amount = paise(amount - used)
      left.set(d.party_id, paise(pot - used))
    }
    if (amount > 0.5) out.push({ ...d, amount })
  }
  return out
}

const paise = (x: number) => Math.round(x * 100) / 100

/* Oldest bill first: by the date it falls due, then the day it was written,
   then the instant, then id. Two bills with the same due date used to be
   ordered by whatever order the phone returned them in — and since a payment
   that clears one bill can leave 30 paise on the other (which then counts as
   paid), that order changed the total. It is now the same on every phone and
   on the server (summary.js uses the same four keys). */
const oldestFirst = (a: Due, b: Due) =>
  (a.due_date || a.date) < (b.due_date || b.date) ? -1 : (a.due_date || a.date) > (b.due_date || b.date) ? 1
    : a.date < b.date ? -1 : a.date > b.date ? 1
      : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1
        : a.entry_id < b.entry_id ? -1 : a.entry_id > b.entry_id ? 1 : 0

const dueOf = (s: StockEntry): Due => ({ party_id: s.party_id, date: s.date, due_date: s.due_date || '', amount: s.amount, item_id: s.item_id, entry_id: s.id, created_at: s.created_at, dir: s.dir })

/** What a due is, for a list: the item, or — for a row that names none — the kind of row it is. */
export function dueLabel(d: Due, itemName: (id: ID) => string): string {
  return d.item_id ? itemName(d.item_id) : noItemLabel(d.dir)
}

/** A stock row that names no item: an old balance, or a sale written by its total alone. */
export function noItemLabel(dir: StockDir): string {
  return dir === OPENING_GET || dir === OPENING_OWE ? t('পুরোনো বাকি') : t('বাকিতে দিলাম')
}

/** What he still owes his suppliers — an unpaid purchase, or an old balance he owes. */
export function openDues(entries: Entry[]): Due[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]
  const rows = stock
    .filter((s) => (s.dir === 'in' || s.dir === 'transfer' || s.dir === OPENING_OWE) && !s.paid && (s.amount || 0) > 0)
    .map(dueOf)
    .sort(oldestFirst)
  return netted(rows, SETTLED(entries, 'paid'))
}

/** What his customers still owe him — a sale written down as not yet paid, or an old balance. */
export function openReceivables(entries: Entry[]): Due[] {
  const stock = liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]
  const rows = stock
    .filter((s) => (s.dir === 'sale' || s.dir === OPENING_GET) && !s.paid && (s.amount || 0) > 0)
    .map(dueOf)
    .sort(oldestFirst)
  return netted(rows, SETTLED(entries, 'received'))
}

export function receivablesSplit(entries: Entry[]) {
  const all = openReceivables(entries)
  const today = isoDate()
  const week = addDays(today, 7)
  return {
    all,
    overdue: all.filter((d) => isLate(d, today)).reduce((a, d) => a + d.amount, 0),
    thisWeek: all.filter((d) => d.due_date && d.due_date >= today && d.due_date <= week).reduce((a, d) => a + d.amount, 0),
    total: all.reduce((a, d) => a + d.amount, 0),
  }
}

/** One party's standing balance, for the payment screen. */
export function partyBalance(entries: Entry[], party_id: ID) {
  const owe = openDues(entries).filter((d) => d.party_id === party_id).reduce((a, d) => a + d.amount, 0)
  const get = openReceivables(entries).filter((d) => d.party_id === party_id).reduce((a, d) => a + d.amount, 0)
  return { owe, get }
}

export function duesSplit(entries: Entry[]) {
  const all = openDues(entries)
  const today = isoDate()
  const week = addDays(today, 7)
  const overdue = all.filter((d) => isLate(d, today)).reduce((a, d) => a + d.amount, 0)
  const thisWeek = all.filter((d) => d.due_date && d.due_date >= today && d.due_date <= week).reduce((a, d) => a + d.amount, 0)
  const total = all.reduce((a, d) => a + d.amount, 0)
  return { all, overdue, thisWeek, total }
}

/* ---- stock ---- */

export interface StockLevel { item_id: ID; qty: number; value: number; rate: number }

/** Oldest first, and for two rows on one day, the one written first first.
    A phone hands its rows back in id order, which is random, so anything that
    depends on "the latest" must sort rather than trust the order it was given. */
const inOrder = (a: Entry, b: Entry) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1

/** Shop stock: bought in without a project, less sales and transfers out. */
export function shopStock(entries: Entry[], items: Item[]): StockLevel[] {
  const stock = (liveEntries(entries).filter((e) => e.kind === 'stock') as StockEntry[]).sort(inOrder)
  const map = new Map<ID, { qty: number; rate: number }>()
  const anchors = new Map<ID, StockEntry>()
  // Counts in order, so of two counts on one day the later-written stands.
  for (const s of stock) if (s.dir === 'count' && !s.project_id) {
    anchors.set(s.item_id, s)
    map.set(s.item_id, { qty: s.qty, rate: s.rate || 0 })
  }
  for (const s of stock) {
    if (s.project_id && s.dir !== 'transfer') continue
    // Inside the count: written on an earlier day, or on its day no later than the count itself.
    // A sale rung up AFTER the morning count, the same day, is new.
    const a = anchors.get(s.item_id)
    if (a && (s.date < a.date || (s.date === a.date && s.created_at <= a.created_at))) continue
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

/* Both of these count what he wrote and still stands. A day he cancelled, and
   the mirror row that cancelled it, are not "writing the day down" — and the
   server's figure (summary.js) leaves them out the same way, so the phone and
   the brief never disagree about whether he has gone quiet. */
export function entriesInLastDays(entries: Entry[], n: number): number {
  const from = addDays(isoDate(), -(n - 1))
  const batches = new Set<string>()
  for (const e of liveEntries(entries)) if (e.date >= from) batches.add(e.batch)
  return batches.size
}

/** What went out on the business's work in these rows: wages and advances, material bought for a job, and
    other site expenses. Goods put into the shop are stock, not spending; his own spending and the settling of
    an old bill (counted when the goods came) are not the day's cost. One definition, so the day's review,
    History and the month's figure on the home screen stop giving three answers to "what did I spend". */
export function outlay(rows: Entry[]): number {
  let t = 0
  for (const e of rows) {
    if (e.kind === 'attendance') t += (e.amount || 0) + (e.advance || 0)
    else if (e.kind === 'stock' && (e.dir === 'in' || e.dir === 'transfer') && e.project_id) t += e.amount || 0
    else if (e.kind === 'money' && e.dir === 'paid' && !e.personal && e.head_bn !== SETTLE_HEAD) t += e.amount || 0
  }
  return t
}

/** On how many DIFFERENT days he wrote something that still stands, in the last n days (today included).
    Three sales at the counter one evening are one day, not three. */
export function daysWritten(entries: Entry[], n: number): number {
  const today = isoDate()
  const from = addDays(today, -(n - 1))
  return new Set(liveEntries(entries).filter((e) => e.date >= from && e.date <= today).map((e) => e.date)).size
}

/** Has the shop ever had anything in it, or sold or sent anything out? An empty shelf after that is a
    sold-out shop, not a shop nobody has started. */
export function shopEverHandled(entries: Entry[]): boolean {
  return liveEntries(entries).some((e) => e.kind === 'stock'
    && ((e.dir === 'in' && !e.project_id) || e.dir === 'sale' || e.dir === 'transfer' || (e.dir === 'count' && !e.project_id)))
}

export function lastEntryDate(entries: Entry[]): string | null {
  let best: string | null = null
  for (const e of liveEntries(entries)) if (!best || e.date > best) best = e.date
  return best
}

/** The day's own numbers, for the review screen and the receipt. */
export function batchSummary(entries: Entry[], batch: string) {
  const rows = entries.filter((e) => e.batch === batch)
  const wages = (byKind(rows, 'attendance') as AttendanceEntry[]).reduce((a, e) => a + e.amount + e.advance, 0)
  const material = (byKind(rows, 'stock') as StockEntry[]).reduce((a, e) => a + (e.dir === 'in' || e.dir === 'transfer' ? e.amount : 0), 0)
  const other = (byKind(rows, 'money') as MoneyEntry[]).filter((e) => e.dir === 'paid' && e.head_bn !== SETTLE_HEAD).reduce((a, e) => a + e.amount, 0)
  return { wages, material, other, total: wages + material + other }
}
