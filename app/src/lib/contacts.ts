/* Names and numbers out of the phone book.

   Typing a supplier's name on a phone keyboard is the slowest thing in the
   app, and he already has every one of these people saved. Nothing is copied
   in bulk: the picker reads the phone book into memory for one search, he
   taps one person, and only that name and number are written to the ledger.

   In a browser — the tests, the dev server — there is no phone book, and the
   picker simply reports that. */

export interface PhoneContact { name: string; phone: string }

export async function readContacts(): Promise<{ ok: boolean; contacts: PhoneContact[]; error: string }> {
  try {
    const { Contacts } = await import('@capacitor-community/contacts')
    const perm = await Contacts.requestPermissions()
    if (perm.contacts !== 'granted') return { ok: false, contacts: [], error: 'ফোনের নামের তালিকা দেখার অনুমতি দেওয়া হয়নি' }
    const res = await Contacts.getContacts({ projection: { name: true, phones: true } })
    const out: PhoneContact[] = []
    for (const c of res.contacts) {
      const name = c.name?.display?.trim() || [c.name?.given, c.name?.family].filter(Boolean).join(' ').trim()
      if (!name) continue
      const phone = c.phones?.[0]?.number?.replace(/\s+/g, '') || ''
      out.push({ name, phone })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return { ok: true, contacts: out, error: '' }
  } catch {
    return { ok: false, contacts: [], error: 'এই ফোনে নামের তালিকা পড়া গেল না' }
  }
}
