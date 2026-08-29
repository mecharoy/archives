/* The personal book's lock. Not a security boundary against a determined
   attacker with the phone — it is a door on the room, so a partner looking at
   the business book cannot read the family's spending over his shoulder. */

const SALT = 'site-khata/personal/v1'

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + ':' + pin)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function checkPin(pin: string, hash: string): Promise<boolean> {
  if (!hash) return true
  return (await hashPin(pin)) === hash
}
