/* Payment reminders.

   A due date is only useful if something says it out loud on the morning it
   matters. Android's own notification queue does that; the app does not have
   to be running, and nothing leaves the phone.

   Reminders are rebuilt from scratch every time the ledger changes, never
   patched: cancel everything this app scheduled, then schedule what the
   current dues say. A due that has been paid off simply does not come back,
   so a settled bill can never keep nagging. */

import { openDues, openReceivables, owedByPerson, liveEntries } from './calc'
import { billReminders } from './bills'
import { getState } from './store'
import { isoDate, addDays, money, fromIso, toBn } from './bn'
import { t, tf } from './i18n'
import type { Bill, Entry } from './model'

export type RemindWhen = 'off' | 'same' | 'day' | 'three'

export const REMIND_DAYS: Record<Exclude<RemindWhen, 'off'>, number> = { same: 0, day: 1, three: 3 }

/* Ids are ours alone, so cancelling ours never touches another app's. */
const ID_BASE = 71000

interface Planned { id: number; at: Date; title: string; body: string; largeBody?: string; extra?: { screen: string } }

/** Which of the four he wants, and the morning's lines. Each is on unless switched off; the morning note needs
    something to say. */
export interface PlanOpts { morning?: string; evening?: boolean; monday?: boolean }

/* The notification channel: sound and a banner, so a reminder is noticed. Android keeps a channel's settings
   once made, so its id is fixed here for good. */
export const CHANNEL = 'sitekhata'
const TEST_ID = ID_BASE + 999

export function plan(entries: Entry[], when: RemindWhen, hour = 9, billRows: Bill[] = [], onboarded = false, o: PlanOpts = {}): Planned[] {
  const today = isoDate()
  const out: Planned[] = []
  let n = 0

  /* 8 in the morning, right after a saved evening: the day's few lines (Google's, or the phone's own when Google
     could not be reached). The app is not running at 8, so this is planned in advance — rebuilt whenever the
     ledger or the brief changes. Only for the morning that follows a saved day: yesterday's lines are not sent
     again tomorrow. */
  if (onboarded && o.morning && o.morning.trim()) {
    const at = new Date()
    at.setHours(8, 0, 0, 0)
    if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1)
    const target = isoDate(at)
    const days = liveEntries(entries).filter((e) => e.kind === 'day')
    if (days.some((e) => e.date === target || e.date === addDays(target, -1))) {
      out.push({ id: ID_BASE + 940, at, title: t('আজকের কথা'), body: o.morning.trim(), largeBody: o.morning.trim(), extra: { screen: 'home' } })
    }
  }

  /* 8 in the evening, on a day with nothing written: "today's entry is still to do". Planned for tonight
     and the next six evenings — the app is not running at 8, so these sit in Android's own queue — and
     rebuilt whenever the ledger changes, so saving today's day takes tonight's off. Only once setup is
     done, and whatever the payment-reminder setting: this one is about writing, not about money. */
  if (onboarded && o.evening !== false) {
    const wroteToday = liveEntries(entries).some((e) => e.kind === 'day' && e.date === today)
    for (let k = 0; k < 7; k++) {
      if (k === 0 && wroteToday) continue
      const at = fromIso(addDays(today, k))
      at.setHours(20, 0, 0, 0)
      if (at.getTime() <= Date.now()) continue
      out.push({ id: ID_BASE + 950 + k, at, title: t('আজকের হিসাব'), body: t('আজকের হিসাব এখনও লেখা হয়নি।'), extra: { screen: 'day' } })
    }
  }

  if (when === 'off') return out
  const before = REMIND_DAYS[when]

  /* Monday, 9 in the morning: who still owes him, all together. Collecting is the thing he most needs
     the book for, and a weekly nudge with the total is what gets the calls made. Tapping it opens পাবেন. */
  const owed = owedByPerson(entries)
  if (owed.length && o.monday !== false) {
    const at = new Date()
    at.setHours(hour, 0, 0, 0)
    const wait = (1 - at.getDay() + 7) % 7                // days until Monday; 0 when today is Monday
    at.setDate(at.getDate() + (wait === 0 && at.getTime() <= Date.now() ? 7 : wait))
    out.push({
      id: ID_BASE + 900, at, title: t('টাকা পাবেন'),
      body: tf('{0} জনের কাছে {1} পাওনা।', toBn(owed.length), money(owed.reduce((a, x) => a + x.amount, 0))),
      extra: { screen: 'payments' },
    })
  }

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
    if (!d.due_date || d.due_date < today) continue  // no date to remind about, or already gone by
    let at = fromIso(addDays(d.due_date, -before))
    at.setHours(hour, 0, 0, 0)
    if (at.getTime() <= Date.now()) {
      /* The morning it should have fired has already passed — he wrote the date
         down late (rent due tomorrow, entered this afternoon, "a day before"
         was this morning). Skipping it would mean no reminder at all, so it
         falls back to the morning of the day itself, if that is still ahead. */
      at = fromIso(d.due_date)
      at.setHours(hour, 0, 0, 0)
      if (at.getTime() <= Date.now()) continue
    }
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
      extra: { screen: 'payments' },
    })
    if (out.length >= 60) break                      // Android's own ceiling
  }
  return out
}

/** Rebuild the phone's reminder queue from the ledger as it stands now. */
export async function reschedule(): Promise<{ ok: boolean; count: number; error: string }> {
  const s = getState()
  const when = s.settings.remind
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { currentBrief } = await import('./brief')
    const morning = s.settings.notify_morning ? (currentBrief().headline_bn || '') : ''
    const rows = plan(s.entries, when, 9, s.masters.filter((m) => m.kind === 'bill') as Bill[], s.settings.onboarded,
      { morning, evening: s.settings.notify_evening, monday: s.settings.notify_monday })
    // Asked for at setup, with a line saying why. A phone set up before that is asked here, once there is
    // something to be reminded of.
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') {
      if (!rows.length) return { ok: true, count: 0, error: '' }
      const perm = await LocalNotifications.requestPermissions()
      if (perm.display !== 'granted') return { ok: false, count: 0, error: 'মনে করিয়ে দেওয়ার অনুমতি দেওয়া হয়নি' }
    }
    await ensureChannel()

    // A test note on its way is left alone.
    const pending = await LocalNotifications.getPending()
    const mine = pending.notifications.filter((x) => x.id >= ID_BASE && x.id < ID_BASE + 1000 && x.id !== TEST_ID)
    if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((x) => ({ id: x.id })) })

    if (rows.length) {
      await LocalNotifications.schedule({
        notifications: rows.map((r) => ({
          id: r.id, title: r.title, body: r.body, ...(r.largeBody ? { largeBody: r.largeBody } : {}),
          channelId: CHANNEL,
          schedule: { at: r.at, allowWhileIdle: true },
          extra: r.extra,
        })),
      })
    }
    return { ok: true, count: rows.length, error: '' }
  } catch {
    return { ok: false, count: 0, error: 'এই ফোনে মনে করিয়ে দেওয়া চালু করা গেল না' }
  }
}

/* The one channel every note goes out on: importance 4 is a banner with Android's own sound. */
async function ensureChannel(): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL, name: t('সাইট খাতা'), description: t('হিসাবের কথা আর মনে করিয়ে দেওয়া'),
      importance: 4, visibility: 1, vibration: true,
    })
  } catch { /* older Android: no channels, nothing to make */ }
}

/** Whether notes can show at all: 'granted', 'denied', or 'none' off a phone. */
export async function notifyPermission(): Promise<'granted' | 'denied' | 'none'> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    return (await LocalNotifications.checkPermissions()).display === 'granted' ? 'granted' : 'denied'
  } catch { return 'none' }
}

/** Ask for notes once, at setup, after the line saying why. True when allowed. */
export async function askNotify(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    if ((await LocalNotifications.checkPermissions()).display === 'granted') return true
    return (await LocalNotifications.requestPermissions()).display === 'granted'
  } catch { return false }
}

/** Whether the phone lets the notes come at the exact minute. Recent Android may hold them back otherwise. */
export async function exactAlarms(): Promise<'granted' | 'denied' | 'none'> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted' ? 'granted' : 'denied'
  } catch { return 'none' }
}

/** Open the phone's own page for it (the helper turns it on). */
export async function openExactAlarms(): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.changeExactNotificationSetting()
  } catch { /* not a phone */ }
}

/** One note in ten seconds, to see that notes arrive. '' when sent, else the reason in his words. */
export async function testNotification(): Promise<string> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    if (!(await askNotify())) return t('মনে করিয়ে দেওয়ার অনুমতি দেওয়া হয়নি')
    await ensureChannel()
    await LocalNotifications.schedule({
      notifications: [{
        id: TEST_ID, title: t('সাইট খাতা'), body: t('মনে করিয়ে দেওয়া ঠিকমতো আসছে।'), channelId: CHANNEL,
        schedule: { at: new Date(Date.now() + 10_000), allowWhileIdle: true },
      }],
    })
    return ''
  } catch {
    return t('এই ফোনে মনে করিয়ে দেওয়া চালু করা গেল না')
  }
}
