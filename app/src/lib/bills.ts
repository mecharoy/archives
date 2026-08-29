/* Payments he knows are coming.

   "On the 5th I have to pay ₹4,000 to the landlord." A bill is not a ledger
   entry — nothing has happened yet — so it is a master: he can move the date,
   correct the amount, mark it paid, and a monthly one comes round again on
   its own. Marking it paid is the only moment money is involved, and that
   writes an ordinary money row so the cash in hand and the month's spending
   are right without anything here being special-cased.

   Rent, school fees and the electricity bill are the household's; a machine
   hire or a licence fee is the business's. The `personal` flag decides which
   book it belongs to, and the personal ones live behind the same passcode as
   the rest of his own book. */

import { isoDate, addDays } from './bn'
import { uid } from './db'
import { saveMaster, saveEntries, getState } from './store'
import { scheduleSync } from './sync'
import type { Bill, MoneyEntry } from './model'

/** Not yet paid. A paid one is kept, not deleted — it is his own history. */
export const isOpen = (b: Bill) => !b.paid_on

export function daysAway(b: Bill, today = isoDate()): number {
  return Math.round((Date.parse(b.due_date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
}

export const isOverdue = (b: Bill, today = isoDate()) => isOpen(b) && b.due_date < today
export const isDueToday = (b: Bill, today = isoDate()) => isOpen(b) && b.due_date === today

/** Open bills, soonest first — the order he would read them in. */
export function openBills(all: Bill[], personal?: boolean): Bill[] {
  return all
    .filter(isOpen)
    .filter((b) => (personal === undefined ? true : Boolean(b.personal) === personal))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
}

/** What is owed and when, for a screen or a brief. */
export function billTotals(all: Bill[], personal?: boolean, today = isoDate()) {
  const open = openBills(all, personal)
  const week = addDays(today, 7)
  let total = 0, overdue = 0, thisWeek = 0
  for (const b of open) {
    const amt = b.amount || 0
    total += amt
    if (b.due_date < today) overdue += amt
    else if (b.due_date <= week) thisWeek += amt
  }
  return { total, overdue, week: thisWeek, count: open.length, next: open[0] || null }
}

/** The same day next month, pulled back when that month is short. */
export function nextMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 1 : m + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, last)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${year}-${p(month)}-${p(day)}`
}

export function blankBill(personal: boolean): Bill {
  return {
    id: uid(), kind: 'bill', name_bn: '', to_bn: '', amount: 0,
    due_date: addDays(isoDate(), 7), repeat: 'once', personal,
    paid_on: '', note: '', updated_at: '',
  }
}

/* Marking it paid does two things, in this order: it writes the money row —
   because that is the fact — and only then closes the reminder. If the app
   died between the two, he would have a paid row and a reminder still
   standing, which he can see and fix. The other order would lose the money. */
export async function payBill(b: Bill, opts: { mode?: string; date?: string } = {}): Promise<void> {
  const date = opts.date || isoDate()
  const row: MoneyEntry = {
    id: uid(), kind: 'money', batch: uid(), date, project_id: '',
    head_bn: b.name_bn || 'অন্যান্য',
    dir: 'paid',
    amount: b.amount || 0,
    party_id: '',
    mode: opts.mode || 'নগদ',
    note: b.to_bn ? `${b.to_bn}${b.note ? ' · ' + b.note : ''}` : b.note,
    personal: Boolean(b.personal),
    photo_id: '',
    created_at: new Date().toISOString(),
  }
  await saveEntries([row])

  if (b.repeat === 'monthly') {
    // It comes round again, and the one just paid is kept as history.
    await saveMaster({ ...b, paid_on: date, updated_at: new Date().toISOString() })
    await saveMaster({ ...blankBill(Boolean(b.personal)), name_bn: b.name_bn, to_bn: b.to_bn,
      amount: b.amount, due_date: nextMonth(b.due_date), repeat: 'monthly', note: b.note })
  } else {
    await saveMaster({ ...b, paid_on: date, updated_at: new Date().toISOString() })
  }
  scheduleSync(300)
}

/** Bills as the reminder queue wants them: a date, an amount, and a name. */
export function billReminders(all: Bill[]): { due_date: string; amount: number; who: string; what: string; personal: boolean }[] {
  return openBills(all).map((b) => ({
    due_date: b.due_date,
    amount: b.amount || 0,
    who: b.to_bn || '',
    what: b.name_bn || '',
    personal: Boolean(b.personal),
  }))
}

export const bills = () => getState().masters.filter((m) => m.kind === 'bill') as Bill[]
