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

/** wa.me wants the country code and digits only. */
export function whatsappHref(phone: string): string {
  const t = telHref(phone)
  return t ? 'https://wa.me/' + t.replace(/[^0-9]/g, '') : ''
}
