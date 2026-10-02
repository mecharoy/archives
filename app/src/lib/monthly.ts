/* The rule for a bill that comes round every month.

   "Rent on the 31st" has to come back on the 31st. Done naively — the same
   day next month, pulled back when the month is short — it slides: 31 January
   becomes 28 February, and 28 February becomes 28 March, 28 April, for ever.
   So when a date has to be pulled back, the day he really means is kept with
   it, as `monthly@31`, and the next month starts from that day rather than
   from the pulled-back one. A bill on the 15th is just `monthly`.

   Pure: no storage, no screen. bills.ts and the tests both use it. */

export type Repeat = 'once' | 'monthly' | `monthly@${number}`

const ANCHORED = /^monthly@(\d{1,2})$/

export const isMonthly = (repeat: string): boolean => repeat === 'monthly' || ANCHORED.test(repeat)

const lastDayOf = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate()
const pad = (x: number) => String(x).padStart(2, '0')

/** The day of the month he means: the remembered one, else the date's own. */
export function monthlyAnchor(due_date: string, repeat: string): number {
  const m = ANCHORED.exec(repeat)
  if (m) return Math.min(31, Math.max(1, Number(m[1])))
  return Number(due_date.split('-')[2]) || 1
}

/** The same day next month, pulled back when that month is short. */
export function nextMonth(iso: string, anchor?: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 1 : m + 1
  const day = Math.min(anchor ?? d, lastDayOf(year, month))
  return `${year}-${pad(month)}-${pad(day)}`
}

/** What a monthly bill becomes once it has been paid: its next date, and the
    repeat value that keeps the day he really means. */
export function nextDue(due_date: string, repeat: string): { due_date: string; repeat: Repeat } {
  const anchor = monthlyAnchor(due_date, repeat)
  const next = nextMonth(due_date, anchor)
  const day = Number(next.split('-')[2])
  return { due_date: next, repeat: anchor > day ? `monthly@${anchor}` : 'monthly' }
}
