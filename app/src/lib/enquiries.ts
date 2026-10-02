/* What the public website has sent him.

   A visitor fills in the form on the website; the website posts it to the
   Worker, and this brings it down to the phone, with a number he can call. It
   is read-only here: nothing he does on this screen is written back, and the
   phone only remembers which ones he has already looked at.

   There is no push. A phone only hears about a new enquiry when the app is
   open (or comes to the front) with signal — the home screen says so when
   there is one waiting. The website also emails the same enquiry, so a missed
   one is never the only copy. */

import { kvSet } from './db'
import { getState, setState, apiUrl } from './store'
import { t, tf } from './i18n'

export interface Enquiry {
  id: string
  received_at: string
  name: string
  phone: string
  email: string
  location: string
  service: string
  message: string
  locale: string
}

const MAX = 200

/* Anyone can type anything into a public form, so every field is clamped and
   stripped of control characters before it is kept. React shows text as text,
   never as markup; this is about length and tidiness, not escaping. */
const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : ''

export function parseEnquiries(raw: unknown): Enquiry[] {
  if (!Array.isArray(raw)) return []
  const out: Enquiry[] = []
  for (const r of raw.slice(0, MAX)) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const id = clean(o.id, 64)
    const received_at = clean(o.received_at, 40)
    const name = clean(o.name, 120)
    const phone = clean(o.phone, 20)
    if (!id || !name || !phone || !Number.isFinite(Date.parse(received_at))) continue
    out.push({
      id, received_at, name, phone,
      email: clean(o.email, 160), location: clean(o.location, 160), service: clean(o.service, 80),
      message: clean(o.message, 4000), locale: clean(o.locale, 5),
    })
  }
  return out
}

/** A dialable number: India's 10 digits get +91, an existing + or 91 is kept. */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '')
  if (!digits) return ''
  if (phone.trim().startsWith('+')) return 'tel:+' + digits
  if (digits.length === 10) return 'tel:+91' + digits
  if (digits.length === 11 && digits.startsWith('0')) return 'tel:+91' + digits.slice(1)
  if (digits.length === 12 && digits.startsWith('91')) return 'tel:+' + digits
  return 'tel:' + digits
}

/** wa.me wants the country code and digits only. */
export function whatsappHref(phone: string): string {
  const t = telHref(phone)
  return t ? 'https://wa.me/' + t.replace(/[^0-9]/g, '') : ''
}

export const unseenIds = (): string[] => {
  const s = getState()
  const seen = new Set(s.enquiries_seen)
  return s.enquiries.filter((e) => !seen.has(e.id)).map((e) => e.id)
}

/** Bring the list down. '' on success; with `silent`, a phone with no server
    set, or a server that predates this route, says nothing. */
export async function fetchEnquiries(silent = true): Promise<string> {
  const s = getState()
  const url = apiUrl('/enquiries')
  if (!url || !s.settings.token) return silent ? '' : t('সেটিংসে ঠিকানা দেওয়া নেই')
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + s.settings.token }, signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (res.status === 404) return silent ? '' : t('সার্ভারে এখনও এই সুবিধা নেই')
    if (res.status === 401) return t('টোকেন মিলল না')
    if (!res.ok) return tf('সার্ভার {0}', res.status)
    const data = (await res.json()) as { enquiries?: unknown }
    const list = parseEnquiries(data.enquiries)
    await kvSet('enquiries', list)
    setState({ enquiries: list })
    return ''
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (silent) return ''
    return /abort/i.test(m) ? t('সময় শেষ') : t('নেট পাওয়া যাচ্ছে না')
  }
}

/** He has looked at all of them. */
export async function markEnquiriesSeen(): Promise<void> {
  const s = getState()
  const ids = [...new Set([...s.enquiries_seen, ...s.enquiries.map((e) => e.id)])].slice(-1000)
  if (ids.length === s.enquiries_seen.length) return
  await kvSet('enquiries_seen', ids)
  setState({ enquiries_seen: ids })
}
