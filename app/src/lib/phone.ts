/* Phone numbers as links: one tap to ring, one to open WhatsApp. Pure, so the
   node checks can load it without the rest of the app. */

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

/** The ten digits that name an Indian mobile, however it was written (+91, 0, spaces, dashes). */
function core(phone: string): string {
  const d = phone.replace(/[^0-9]/g, '')
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  if (d.length === 11 && d.startsWith('0')) return d.slice(1)
  return d
}

/** The person already holding this number, if any — so a phone-book pick reuses him instead of making a
    second record that splits his dues in two. An empty number matches nobody. */
export function findByPhone<T extends { phone: string }>(people: T[], phone: string): T | undefined {
  const want = core(phone)
  if (!want) return undefined
  return people.find((p) => core(p.phone || '') === want)
}

/** wa.me wants the country code and digits only. */
export function whatsappHref(phone: string): string {
  const t = telHref(phone)
  return t ? 'https://wa.me/' + t.replace(/[^0-9]/g, '') : ''
}
