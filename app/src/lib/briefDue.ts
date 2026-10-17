/* When the phone writes its brief — kept apart from aiBrief.ts so it can be checked on its own.

   After six in the evening, but only once today's day is saved: a brief written before the evening's
   entry describes a day that has not been written yet. Again whenever the day is saved after the last
   brief (he went back and added the cement). A missed evening is caught up the next morning. A key
   Google refused, or a try in the last half hour, waits. All times are Kolkata's. */

const EVENING_HOUR = 18
const RETRY_MINUTES = 30

/** The same instant, as a Date whose local fields read Kolkata time. */
const ist = (d: Date) => new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function briefDue(o: {
  now: Date; hasKey: boolean; badKey: boolean
  /** When the last try started (ISO, '' for never). */
  triedAt: string
  /** The Kolkata day of the last brief with the model's words. */
  doneDay: string
  /** When that brief was made (ISO, '' for never). */
  madeAt: string
  /** When today's latest day row was written (ISO, '' when today has none). */
  dayRowAt: string
}): boolean {
  if (!o.hasKey || o.badKey) return false
  if (o.triedAt && o.now.getTime() - new Date(o.triedAt).getTime() < RETRY_MINUTES * 60000) return false
  const now = ist(o.now)
  const today = ymd(now)
  const yesterday = ymd(new Date(now.getTime() - 86400000))
  if (now.getHours() >= EVENING_HOUR) {
    const savedToday = !!o.dayRowAt && ymd(ist(new Date(o.dayRowAt))) === today
    if (!savedToday) return false
    return o.doneDay !== today || o.dayRowAt > o.madeAt
  }
  return o.doneDay < yesterday
}
