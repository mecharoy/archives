/* The day in progress.
   Held in IndexedDB from the first tap, so walking away halfway — a phone
   call, a truck arriving — costs nothing. Only the review screen's খাতায় তুলুন
   turns it into entries; before that the ledger is untouched.

   One evening can hold several jobs. Each job he ticks is a "site" in the
   draft with its own men, material, expenses and slider; the shop's own men
   are a site with no job. What belongs to the day rather than to a job — his
   own spending, goods for the shop, money that came in, the cash count, the
   note — sits on the draft itself. */

import type { ID, Presence, Entry, DayEntry, AttendanceEntry, StockEntry, MoneyEntry, ProgressEntry } from './model'
import { kvGet, kvSet, kvDel, uid } from './db'
import { isoDate } from './bn'
import { cashState, JOB_PAY_HEAD } from './calc'

export interface DraftAtt { presence: Presence; rate: number; amount: number; advance: number }
export interface DraftMat { key: string; item_id: ID; qty: number; rate: number; party_id: ID | ''; due_date: string; paid: boolean; photo_id: ID | '' }
export interface DraftExp { key: string; head_bn: string; amount: number; mode: string; note: string; photo_id: ID | '' }
/* Material coming back off the site. It re-enters the shop and comes off this
   job's material cost — the exact reverse of sending it — so a rate is all
   it needs beyond the item and quantity. */
export interface DraftRet { key: string; item_id: ID; qty: number; rate: number }
/* Money that came in for a job today. Its own job, not the day's: a customer of another site can pay
   on the evening he is writing this one. Cash, or online (stored as 'UPI', which cash never counts). */
export interface DraftRecv { key: string; project_id: ID; amount: number; mode: 'নগদ' | 'UPI' }

/** One job's part of the evening. project_id '' is the shop's own men. `pct` is the slider: null until he
    moves it. `stage` is only ever carried over from a day half-written by an older build. */
export interface DraftSite {
  project_id: ID | ''
  att: Record<ID, DraftAtt>
  /* The crew has been pre-ticked once. Remembered here, not in the screen, so unticking everyone and coming back does not tick them again. */
  att_seeded?: boolean
  mats: DraftMat[]
  rets: DraftRet[]
  exps: DraftExp[]
  pct: number | null
  stage?: { stage_seq: number; state: 'half' | 'done' }
}

export interface Draft {
  batch: ID
  date: string
  sites: DraftSite[]
  /* "Which jobs today?" has been answered — so a draft he left after it does not ask again. */
  picked: boolean
  recv: DraftRecv[]
  pexps: DraftExp[]
  invs: DraftMat[]
  cash_counted: number | null
  cash_computed: number | null
  note: string
  /* The step he was on, by its key (see day.ts), so a draft he left opens where he was. */
  at?: string
  started_at: string
}

/* The fields a draft had before one evening could hold several jobs (build 26 and earlier). */
interface LegacyFields {
  project_id?: ID | ''
  att?: Record<ID, DraftAtt>
  att_seeded?: boolean
  mats?: DraftMat[]
  rets?: DraftRet[]
  exps?: DraftExp[]
  progress?: { stage_seq: number; state: 'half' | 'done' } | null
  step?: number
  from_yesterday?: boolean
}

export const DAYS_FOR: Record<Presence, number> = { full: 1, half: 0.5, ot: 1.5 }

export function newSite(project_id: ID | ''): DraftSite {
  return { project_id, att: {}, mats: [], rets: [], exps: [], pct: null }
}

/** A fresh day. `sites` are the jobs already ticked ('' for the shop's men); a single job id is read as one. */
export function newDraft(date = isoDate(), sites: (ID | '')[] | ID = []): Draft {
  const list = typeof sites === 'string' ? (sites ? [sites] : []) : sites
  return {
    batch: uid(), date, sites: list.map(newSite), picked: false, recv: [], pexps: [], invs: [],
    cash_counted: null, cash_computed: null, note: '', started_at: new Date().toISOString(),
  }
}

/* A draft read back from storage, or built by an older build, in today's shape. The old one-job fields are
   folded into that job's site — or a site with no job when men or spending were written without one — so a
   day typed before this update loses nothing. The step it was on is not carried over: the old step names
   mean nothing now, and the first screen shows everything already filled in. */
export function normalizeDraft(raw: Draft & LegacyFields): Draft {
  const d = raw as Draft & LegacyFields
  const sites: DraftSite[] = (d.sites ?? []).map((s) => ({
    ...s, att: s.att ?? {}, mats: s.mats ?? [], rets: s.rets ?? [], exps: s.exps ?? [], pct: s.pct ?? null,
  }))
  const legacy = !!(d.project_id || (d.att && Object.keys(d.att).length) || d.mats?.length || d.rets?.length || d.exps?.length || d.progress)
  let at = d.at
  if (legacy) {
    // An old draft names its job; one built the new way with old fields set on top has exactly one site.
    const pid = d.project_id !== undefined ? d.project_id : sites.length === 1 ? sites[0].project_id : ''
    let s = sites.find((x) => x.project_id === pid)
    if (!s) { s = newSite(pid); sites.unshift(s) }
    s.att = { ...s.att, ...(d.att ?? {}) }
    s.mats = [...s.mats, ...(d.mats ?? [])]
    s.rets = [...s.rets, ...(d.rets ?? [])]
    s.exps = [...s.exps, ...(d.exps ?? [])]
    if (d.att_seeded) s.att_seeded = true
    if (d.progress) s.stage = d.progress
    if (!d.sites) at = undefined
  }
  return {
    batch: d.batch, date: d.date, sites, picked: d.picked ?? (legacy || sites.length > 0),
    recv: d.recv ?? [], pexps: d.pexps ?? [], invs: d.invs ?? [],
    cash_counted: d.cash_counted ?? null, cash_computed: d.cash_computed ?? null, note: d.note ?? '',
    ...(at ? { at } : {}), started_at: d.started_at || new Date().toISOString(),
  }
}

/* One half-written day per DATE. There used to be a single slot, so starting yesterday from History
   overwrote the day he was halfway through today, and "today" then opened yesterday's. The old slot is
   still read once so a day typed before this update is not lost. */
const KEY = 'draft'
const INDEX = 'draft_dates'
const keyFor = (date: string) => 'draft:' + date

/** With a date: that day's draft. Without: today's if there is one, else the newest other. */
export async function loadDraft(date?: string): Promise<Draft | null> {
  if (date) return kvGet<Draft | null>(keyFor(date), null)
  const dates = await kvGet<string[]>(INDEX, [])
  const pick = dates.includes(isoDate()) ? isoDate() : [...dates].sort().reverse()[0]
  if (pick) { const d = await kvGet<Draft | null>(keyFor(pick), null); if (d) return d }
  return kvGet<Draft | null>(KEY, null)
}
export async function saveDraft(d: Draft) {
  await kvSet(keyFor(d.date), d)
  const dates = await kvGet<string[]>(INDEX, [])
  if (!dates.includes(d.date)) await kvSet(INDEX, [...dates, d.date])
}
export async function clearDraft(date?: string) {
  if (date) {
    await kvDel(keyFor(date))
    const dates = await kvGet<string[]>(INDEX, [])
    if (dates.includes(date)) await kvSet(INDEX, dates.filter((x) => x !== date))
  }
  const old = await kvGet<Draft | null>(KEY, null)
  if (old && (!date || old.date === date)) await kvDel(KEY)
}

/** What the book says is in his pocket once THIS day is saved, by the same rules as the real book
    (cash purchases and cash expenses, wages and advances; not credit, not UPI) and counted only from
    his last physical count. */
export function cashAfterDay(entries: Entry[], d: Draft, openingAmount: number, openingDate: string): number {
  const rows = buildEntries({ ...d, cash_counted: null, cash_computed: null })
  return Math.round(cashState([...entries, ...rows], openingAmount, openingDate).computed)
}

const siteEmpty = (s: DraftSite) => !Object.keys(s.att).length && !s.mats.length && !s.rets.length && !s.exps.length && s.pct == null && !s.stage

export function draftIsEmpty(d: Draft): boolean {
  return d.sites.every(siteEmpty) && !d.pexps.length && !d.invs.length && !d.recv.length && d.cash_counted == null
}

export const siteWages = (s: DraftSite) => Object.values(s.att).reduce((a, x) => a + x.amount + x.advance, 0)
export const siteMat = (s: DraftSite) => s.mats.reduce((a, m) => a + m.qty * m.rate, 0)
export const siteExp = (s: DraftSite) => s.exps.reduce((a, e) => a + e.amount, 0)
export const siteRet = (s: DraftSite) => s.rets.reduce((a, r) => a + r.qty * r.rate, 0)

export function recvTotal(d: Draft): number {
  return d.recv.reduce((a, r) => a + r.amount, 0)
}
export function retTotal(d: Draft): number {
  return d.sites.reduce((a, s) => a + siteRet(s), 0)
}
export function pexpTotal(d: Draft): number {
  return d.pexps.reduce((a, e) => a + e.amount, 0)
}
export function invTotal(d: Draft): number {
  return d.invs.reduce((a, m) => a + m.qty * m.rate, 0)
}
export function wageTotal(d: Draft): number {
  return d.sites.reduce((a, s) => a + siteWages(s), 0)
}
export function matTotal(d: Draft): number {
  return d.sites.reduce((a, s) => a + siteMat(s), 0)
}
export function expTotal(d: Draft): number {
  return d.sites.reduce((a, s) => a + siteExp(s), 0)
}
export function dayTotal(d: Draft): number {
  return wageTotal(d) + matTotal(d) + expTotal(d)
}

/** The only place a draft becomes ledger rows. Wages can be built here and
    nowhere else, which is what keeps them out of the Money tab.

    One evening is one batch written at one instant, whatever number of jobs it holds: each job's rows carry
    that job, and the day's own rows (his own spending, goods for the shop, the day row with the cash count)
    carry none. The shared instant matters — the cash count treats everything written with it as before the
    count, so a row stamped a moment later would be taken out of the cash a second time. */
export function buildEntries(raw: Draft): Entry[] {
  const d = normalizeDraft(raw)
  const now = new Date().toISOString()
  const day = { batch: d.batch, date: d.date, created_at: now }
  const out: Entry[] = []

  for (const s of d.sites) {
    const base = { ...day, project_id: s.project_id }
    for (const [worker_id, a] of Object.entries(s.att)) {
      const days = DAYS_FOR[a.presence]
      out.push({ id: uid(), kind: 'attendance', ...base, worker_id, presence: a.presence, days, rate: a.rate, amount: a.amount, advance: a.advance } as AttendanceEntry)
    }
    for (const m of s.mats) {
      out.push({ id: uid(), kind: 'stock', ...base, item_id: m.item_id, dir: 'in', qty: m.qty, rate: m.rate, amount: round(m.qty * m.rate), party_id: m.party_id, due_date: m.due_date, paid: m.paid, photo_id: m.photo_id } as StockEntry)
    }
    /* Material coming back off the site: a transfer with the sign flipped. The
       shop-stock sum subtracts a transfer's quantity, so a negative one adds it
       back; the job's material total sums transfers, so a negative amount takes
       it off. One row, both effects, nothing new for the maths to learn. */
    for (const r of s.rets) {
      out.push({ id: uid(), kind: 'stock', ...base, item_id: r.item_id, dir: 'transfer', qty: -r.qty, rate: r.rate, amount: -round(r.qty * r.rate), party_id: '', due_date: '', paid: true, photo_id: '' } as StockEntry)
    }
    for (const e of s.exps) {
      out.push({ id: uid(), kind: 'money', ...base, head_bn: e.head_bn, dir: 'paid', amount: e.amount, party_id: '', mode: e.mode, note: e.note, personal: false, photo_id: e.photo_id } as MoneyEntry)
    }
    if (s.stage) {
      out.push({ id: uid(), kind: 'progress', ...base, stage_seq: s.stage.stage_seq, state: s.stage.state, pct: 0 } as ProgressEntry)
    }
    // The slider, only when he moved it: an untouched slider leaves yesterday's figure standing.
    if (s.pct != null && s.project_id) {
      out.push({ id: uid(), kind: 'progress', ...base, stage_seq: 0, state: 'pct', pct: Math.max(0, Math.min(100, s.pct)) } as ProgressEntry)
    }
  }
  /* Personal spending goes to his own book (personal: true) and carries no
     project, so no job's cost is ever touched by it. */
  for (const e of d.pexps) {
    out.push({ id: uid(), kind: 'money', ...day, project_id: '', head_bn: e.head_bn, dir: 'paid', amount: e.amount, party_id: '', mode: e.mode, note: e.note, personal: true, photo_id: e.photo_id } as MoneyEntry)
  }
  /* Goods put into the shop: stock in with no project, exactly like the shop's
     own ‘মাল এল’, so it lands in the shop count and its supplier dues. */
  for (const m of d.invs) {
    out.push({ id: uid(), kind: 'stock', ...day, project_id: '', item_id: m.item_id, dir: 'in', qty: m.qty, rate: m.rate, amount: round(m.qty * m.rate), party_id: m.party_id, due_date: m.due_date, paid: m.paid, photo_id: m.photo_id } as StockEntry)
  }
  for (const r of d.recv) {
    out.push({ id: uid(), kind: 'money', ...day, project_id: r.project_id, head_bn: JOB_PAY_HEAD, dir: 'received', amount: r.amount, party_id: '', mode: r.mode, note: '', personal: false, photo_id: '' } as MoneyEntry)
  }
  out.push({ id: uid(), kind: 'day', ...day, project_id: '', cash_counted: d.cash_counted, cash_computed: d.cash_computed, note: d.note } as DayEntry)
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
      return { ...common, kind: 'progress', stage_seq: e.stage_seq, state: e.state, pct: e.state === 'pct' ? e.pct : 0 } as ProgressEntry
    default:
      return { ...common, kind: 'day', cash_counted: null, cash_computed: null, note: 'সংশোধন' } as DayEntry
  }
}
