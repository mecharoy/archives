/* Payment reminders.

   A due date is only useful if something says it out loud on the morning it
   matters. Android's own notification queue does that; the app does not have
   to be running, and nothing leaves the phone.

   Reminders are rebuilt from scratch every time the ledger changes, never
   patched: cancel everything this app scheduled, then schedule what the
   current dues say. A due that has been paid off simply does not come back,
   so a settled bill can never keep nagging. */

import { openDues, openReceivables } from './calc'
import { billReminders } from './bills'
import { getState } from './store'
import { isoDate, addDays, money, fromIso } from './bn'
import { t, tf } from './i18n'
import type { Bill, Entry } from './model'

export type RemindWhen = 'off' | 'same' | 'day' | 'three'

export const REMIND_DAYS: Record<Exclude<RemindWhen, 'off'>, number> = { same: 0, day: 1, three: 3 }

/* Ids are ours alone, so cancelling ours never touches another app's. */
const ID_BASE = 71000

interface Planned { id: number; at: Date; title: string; body: string }

export function plan(entries: Entry[], when: RemindWhen, hour = 9, billRows: Bill[] = []): Planned[] {
  if (when === 'off') return []
  const before = REMIND_DAYS[when]
  const today = isoDate()
  const out: Planned[] = []
  let n = 0

  /* Three things can fall due on a morning: a shop bill, money a customer
     owes him, and a payment he has written down himself — rent, a fee, a
     promise to a person. All three go into one queue, sorted by date, so the
     ceiling below is shared fairly rather than spent on shop bills alone. */
  const rows = [
    ...openDues(entries).map((d) => ({ ...d, kind: 'pay' as const, what: '', who: '' })),
    ...openReceivables(entries).map((d) => ({ ...d, kind: 'get' as const, what: '', who: '' })),
    ...billReminders(billRows).map((b) => ({
      due_date: b.due_date, amount: b.amount, party_id: '' as const,
      kind: 'bill' as const, what: b.what, who: b.who,
    })),
  ].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
  for (const d of rows) {
    const fire = addDays(d.due_date, -before)
    if (fire < today) continue                       // already gone by
    const at = fromIso(fire)
    at.setHours(hour, 0, 0, 0)
    if (at.getTime() <= Date.now()) continue
    const s = getState()
    const who = d.party_id ? (s.masters.find((m) => m.id === d.party_id) as { name_bn?: string } | undefined)?.name_bn || '' : ''
    out.push({
      id: ID_BASE + n++,
      at,
      title: d.kind === 'get' ? t('টাকা পাওয়ার দিন') : t('টাকা দেওয়ার দিন'),
      body: d.kind === 'get'
        ? tf('{0} — {1} পাওনা আছে', who || t('খদ্দের'), money(d.amount))
        : d.kind === 'bill'
          ? tf('{0} — {1} দিতে হবে {2}', d.what || t('খরচ'), money(d.amount), d.who ? tf('({0})', d.who) : '')
          : tf('{0} — {1} দিতে হবে', who || t('দোকান'), money(d.amount)),
    })
    if (n >= 60) break                               // Android's own ceiling
  }
  return out
}

/** Rebuild the phone's reminder queue from the ledger as it stands now. */
export async function reschedule(): Promise<{ ok: boolean; count: number; error: string }> {
  const s = getState()
  const when = s.settings.remind
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return { ok: false, count: 0, error: 'মনে করিয়ে দেওয়ার অনুমতি দেওয়া হয়নি' }

    const pending = await LocalNotifications.getPending()
    const mine = pending.notifications.filter((x) => x.id >= ID_BASE && x.id < ID_BASE + 1000)
    if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((x) => ({ id: x.id })) })

    const rows = plan(s.entries, when, 9, s.masters.filter((m) => m.kind === 'bill') as Bill[])
    if (rows.length) {
      await LocalNotifications.schedule({
        notifications: rows.map((r) => ({
          id: r.id, title: r.title, body: r.body,
          schedule: { at: r.at, allowWhileIdle: true },
        })),
      })
    }
    return { ok: true, count: rows.length, error: '' }
  } catch {
    return { ok: false, count: 0, error: 'এই ফোনে মনে করিয়ে দেওয়া চালু করা গেল না' }
  }
}
