/* Types, and the one place that decides which Sheet tab a fact belongs in.
   The double-counting failure the plan warns about is prevented here and
   nowhere else: a wage can only ever be built by rowsForAttendance, and
   the money head list never contains anything that could mean wages. */

export type ID = string
export type MasterKind = 'project' | 'worker' | 'item' | 'party' | 'stage' | 'coeff' | 'bill'

export interface Master {
  id: ID
  kind: MasterKind
  updated_at: string
  deleted?: boolean
}

export interface Project extends Master {
  kind: 'project'
  name_bn: string
  client_bn: string
  ptype: string          // matches Stages.project_type
  area_sqft: number | null
  budget: number | null
  start_date: string
  plan_days: number | null
  status: 'active' | 'done'
}

export interface Worker extends Master {
  kind: 'worker'
  name_bn: string
  rate: number
  phone: string
  active: boolean
}

export interface Item extends Master {
  kind: 'item'
  name_bn: string
  unit_bn: string
  last_rate: number | null
  active: boolean
}

export interface Party extends Master {
  kind: 'party'
  name_bn: string
  ptype: 'supplier' | 'client'
  terms_days: number
  phone: string
}

export interface Stage extends Master {
  kind: 'stage'
  project_type: string
  seq: number
  name_bn: string
  weight: number
}

export interface Coeff extends Master {
  kind: 'coeff'
  project_type: string
  item_id: ID
  per_sqft: number
}

/* A payment he knows is coming: rent on the 5th, a school fee, the electricity
   bill, money promised to a person on a date. It is a master and not a ledger
   entry on purpose — a reminder has a life (move the date, mark it paid, let a
   monthly one come round again), and ledger entries are append-only. Paying it
   writes a real money row; this only ever remembers that it is due. */
export interface Bill extends Master {
  kind: 'bill'
  name_bn: string        // what it is
  to_bn: string          // who it goes to
  amount: number
  due_date: string       // YYYY-MM-DD
  repeat: 'once' | 'monthly'
  personal: boolean      // his own book, or the business
  paid_on: string        // '' while it is still owed
  note: string
}

export type AnyMaster = Project | Worker | Item | Party | Stage | Coeff | Bill

/* ---- the ledger ---- */

export type EntryKind = 'day' | 'attendance' | 'stock' | 'money' | 'progress'
export type Presence = 'full' | 'half' | 'ot'

export interface BaseEntry {
  id: ID
  kind: EntryKind
  batch: ID              // one day's submission; a correction reverses a batch
  date: string           // YYYY-MM-DD, local
  project_id: ID | ''
  created_at: string
  reverses?: ID          // id of the entry this one cancels
  synced?: boolean
}

export interface DayEntry extends BaseEntry {
  kind: 'day'
  cash_counted: number | null
  cash_computed: number | null
  note: string
}

export interface AttendanceEntry extends BaseEntry {
  kind: 'attendance'
  worker_id: ID
  presence: Presence
  days: number           // 1, 0.5, 1.5
  rate: number
  amount: number
  advance: number
}

export type StockDir = 'in' | 'out' | 'sale' | 'transfer' | 'count'

export interface StockEntry extends BaseEntry {
  kind: 'stock'
  item_id: ID
  dir: StockDir
  qty: number
  rate: number
  amount: number
  party_id: ID | ''
  due_date: string
  paid: boolean
  photo_id: ID | ''
}

export interface MoneyEntry extends BaseEntry {
  kind: 'money'
  head_bn: string
  dir: 'paid' | 'received'
  amount: number
  party_id: ID | ''
  mode: string           // নগদ / ব্যাংক / UPI
  note: string
  personal: boolean      // personal book — kept out of every project total
  photo_id: ID | ''
}

export interface ProgressEntry extends BaseEntry {
  kind: 'progress'
  stage_seq: number
  state: 'half' | 'done'
  pct: number            // derived from stage weights, stored so the Sheet needn't re-derive
}

export type Entry = DayEntry | AttendanceEntry | StockEntry | MoneyEntry | ProgressEntry

/* Expense heads. Fixed list — a free-text head is how "মজুরি" ends up in
   the Money tab and every labour cost gets counted twice. */
export const MONEY_HEADS_SITE = [
  'গাড়ি ভাড়া', 'মেশিন ভাড়া', 'ঠিকা কাজ', 'চা-জলখাবার', 'বিদ্যুৎ-জল',
  'যন্ত্রপাতি', 'মেরামত', 'সরকারি খরচ', 'অন্যান্য',
]
export const MONEY_HEADS_PERSONAL = [
  'বাজার', 'ওষুধ', 'পড়াশোনা', 'যাতায়াত', 'বিদ্যুৎ বিল', 'ফোন', 'অনুষ্ঠান', 'অন্যান্য',
]
/* The order a contractor names his materials in. It decides which three
   chips he sees on a fresh install, and nothing more: the moment he has
   bought anything, ranking by what he actually buys takes over. Without it
   the three chips are whichever ids sorted first, which is to say random. */
export const COMMON_ITEM_ORDER = ['সিমেন্ট', 'রড', 'ইট', 'বালি', 'স্টোন চিপস']

export const PAY_MODES = ['নগদ', 'ব্যাংক', 'UPI', 'চেক']

/* The one place a row's shape is decided. Column order here must match the
   header row the Apps Script writes — both are generated from SHEET_COLUMNS. */
export const SHEET_COLUMNS: Record<string, string[]> = {
  Projects: ['id', 'name_bn', 'client_bn', 'ptype', 'area_sqft', 'budget', 'start_date', 'plan_days', 'status', 'updated_at'],
  Workers: ['id', 'name_bn', 'rate', 'phone', 'active', 'updated_at'],
  Items: ['id', 'name_bn', 'unit_bn', 'last_rate', 'active', 'updated_at'],
  Parties: ['id', 'name_bn', 'ptype', 'terms_days', 'phone', 'updated_at'],
  Stages: ['id', 'project_type', 'seq', 'name_bn', 'weight', 'updated_at'],
  Coefficients: ['id', 'project_type', 'item_id', 'per_sqft', 'updated_at'],
  Bills: ['id', 'name_bn', 'to_bn', 'amount', 'due_date', 'repeat', 'personal', 'paid_on', 'note', 'updated_at'],
  Day: ['id', 'batch', 'date', 'project_id', 'cash_counted', 'cash_computed', 'note', 'reverses', 'created_at'],
  Attendance: ['id', 'batch', 'date', 'project_id', 'worker_id', 'presence', 'days', 'rate', 'amount', 'advance', 'reverses', 'created_at'],
  Stock: ['id', 'batch', 'date', 'project_id', 'item_id', 'dir', 'qty', 'rate', 'amount', 'party_id', 'due_date', 'paid', 'photo_id', 'reverses', 'created_at'],
  Money: ['id', 'batch', 'date', 'project_id', 'head_bn', 'dir', 'amount', 'party_id', 'mode', 'note', 'personal', 'photo_id', 'reverses', 'created_at'],
  Progress: ['id', 'batch', 'date', 'project_id', 'stage_seq', 'state', 'pct', 'reverses', 'created_at'],
}

const TAB_FOR_KIND: Record<EntryKind, string> = {
  day: 'Day', attendance: 'Attendance', stock: 'Stock', money: 'Money', progress: 'Progress',
}
const TAB_FOR_MASTER: Record<MasterKind, string> = {
  project: 'Projects', worker: 'Workers', item: 'Items', party: 'Parties', stage: 'Stages', coeff: 'Coefficients',
  bill: 'Bills',
}

function cell(v: unknown): string | number | boolean {
  if (v == null) return ''
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : ''
  return String(v)
}

export interface SheetRow { tab: string; mode: 'append' | 'upsert'; values: (string | number | boolean)[] }

export function rowForEntry(e: Entry): SheetRow {
  const tab = TAB_FOR_KIND[e.kind]
  const rec = e as unknown as Record<string, unknown>
  return { tab, mode: 'append', values: SHEET_COLUMNS[tab].map((c) => cell(rec[c])) }
}

export function rowForMaster(m: AnyMaster): SheetRow {
  const tab = TAB_FOR_MASTER[m.kind]
  const rec = m as unknown as Record<string, unknown>
  return { tab, mode: 'upsert', values: SHEET_COLUMNS[tab].map((c) => cell(rec[c])) }
}
