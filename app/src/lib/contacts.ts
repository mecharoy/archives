/* Names and numbers out of the phone book.

   Two routes, because the first one is the one Android likes: `pickContact`
   hands the job to the system's own picker — he sees the contact list he
   already knows, taps one, and only that person comes back. Nothing else is
   read, and on most versions it needs no permission at all.

   Reading the whole book (`getContacts`) is the fallback for phones where the
   picker is unavailable, and it is also what powers the in-app search box.

   Whatever goes wrong, the real message is passed back rather than a polite
   summary — on a phone I cannot open, the exact words are the whole
   diagnosis. */

export interface PhoneContact { name: string; phone: string }

type Payload = {
  name?: { display?: string | null; given?: string | null; family?: string | null }
  phones?: { number?: string | null }[]
}

const PROJECTION = { projection: { name: true, phones: true } }

function shape(c: Payload): PhoneContact | null {
  const name = c.name?.display?.trim() || [c.name?.given, c.name?.family].filter(Boolean).join(' ').trim()
  if (!name) return null
  return { name, phone: c.phones?.[0]?.number?.replace(/\s+/g, '') || '' }
}

const why = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e)
  return m && m !== 'undefined' ? m : 'কারণ জানা গেল না'
}

/** The system picker: one tap, one person, nothing else read. */
export async function pickOneContact(): Promise<{ ok: boolean; contact: PhoneContact | null; error: string }> {
  try {
    const { Contacts } = await import('@capacitor-community/contacts')
    const res = await Contacts.pickContact(PROJECTION)
    const one = res?.contact ? shape(res.contact as Payload) : null
    if (!one) return { ok: false, contact: null, error: 'ওই নামের সঙ্গে কোনো নম্বর পাওয়া গেল না' }
    return { ok: true, contact: one, error: '' }
  } catch (e) {
    return { ok: false, contact: null, error: why(e) }
  }
}

/** The whole book, for the in-app search box. */
export async function readContacts(): Promise<{ ok: boolean; contacts: PhoneContact[]; error: string }> {
  try {
    const { Contacts } = await import('@capacitor-community/contacts')
    const perm = await Contacts.requestPermissions().catch(() => null)
    if (perm && perm.contacts !== 'granted' && perm.contacts !== 'limited') {
      return { ok: false, contacts: [], error: 'ফোনের নামের তালিকা দেখার অনুমতি দেওয়া হয়নি' }
    }
    const res = await Contacts.getContacts(PROJECTION)
    const out: PhoneContact[] = []
    for (const c of res?.contacts || []) {
      const one = shape(c as Payload)
      if (one) out.push(one)
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    if (!out.length) return { ok: true, contacts: [], error: 'ফোনে কোনো নাম পাওয়া গেল না' }
    return { ok: true, contacts: out, error: '' }
  } catch (e) {
    return { ok: false, contacts: [], error: why(e) }
  }
}
