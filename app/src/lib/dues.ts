/* When money on credit falls due.

   Every credit sale and every credit purchase gets a date — a due with no date
   is never late, so nothing ever reminds him of it. The party's own agreed days
   come first; without them, a week, which he can change with one tap. */

import { addDays, dateInBengali, digitsBn, groupIndian } from './bn'
import { whatsappHref } from './phone'

export const DUE_CHOICES: { days: number; label: string }[] = [
  { days: 7, label: '৭ দিন' },
  { days: 15, label: '১৫ দিন' },
  { days: 30, label: '১ মাস' },
]

/** The days a credit row starts with: the party's own, else a week. */
export function defaultDueDays(termsDays: number): number {
  return termsDays > 0 ? termsDays : 7
}

export function dueFrom(date: string, days: number): string {
  return addDays(date, days)
}

/** The তাগাদা he sends on WhatsApp — polite, short, and always in Bengali: it is the customer who reads it.
    `since` is the date the oldest of that person's open dues was written. */
export function reminderText(name: string, since: string, amount: number, owner: string): string {
  const body = `নমস্কার ${name}, ${dateInBengali(since)} থেকে ₹${digitsBn(groupIndian(Math.round(amount)))} বাকি আছে। সুবিধামতো দিয়ে দেবেন।`
  return owner.trim() ? `${body} — ${owner.trim()}` : body
}

/** WhatsApp opened on that person, the message already typed. Empty when there is no number to send to. */
export function reminderHref(phone: string, text: string): string {
  const base = whatsappHref(phone)
  return base ? base + '?text=' + encodeURIComponent(text) : ''
}
