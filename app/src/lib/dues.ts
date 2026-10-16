/* When money on credit falls due.

   Every credit sale and every credit purchase gets a date — a due with no date
   is never late, so nothing ever reminds him of it. The party's own agreed days
   come first; without them, a week, which he can change with one tap. */

import { addDays } from './bn'

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
