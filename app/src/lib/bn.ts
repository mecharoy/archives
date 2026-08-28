/* Bengali numerals, money and dates.
   Every number the app shows passes through here; every number he types
   comes back through parseNum, so Bengali and ASCII digits are equal citizens. */

const BN = '০১২৩৪৫৬৭৮৯'
const AS = '0123456789'

export function toBn(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN[+d])
}

export function toAscii(s: string): string {
  return s.replace(/[০-৯]/g, (d) => AS[BN.indexOf(d)])
}

/** Accepts "১২৫০", "1250", "1,250", "১,২৫০.৫০", "" -> number | null */
export function parseNum(raw: string): number | null {
  const s = toAscii(String(raw)).replace(/[,\s₹]/g, '').trim()
  if (!s) return null
  if (!/^-?\d*\.?\d*$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Indian digit grouping: 1234567 -> 12,34,567 */
export function groupIndian(n: number): string {
  const neg = n < 0
  const [i, f] = Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2).split('.')
  let out: string
  if (i.length <= 3) out = i
  else {
    const last3 = i.slice(-3)
    const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    out = rest + ',' + last3
  }
  return (neg ? '-' : '') + out + (f ? '.' + f : '')
}

/** ₹১২,৩৪,৫৬৭ */
export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '₹' + toBn(groupIndian(Math.round(n)))
}

/** ₹১২,৩৪,৫৬৭.৫০ — used where paise matter (rates) */
export function moneyExact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '₹' + toBn(groupIndian(n))
}

export function num(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return toBn(dp ? n.toFixed(dp) : String(Math.round(n)))
}

export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return toBn(Math.round(n)) + '%'
}

const MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']
const DAYS = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার']

/** local YYYY-MM-DD — never toISOString(), which silently shifts the day in IST */
export function isoDate(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86400000)
}

/** ২৮ আগস্ট, বৃহস্পতিবার */
export function dateBn(iso: string, withDay = true): string {
  const d = fromIso(iso)
  const s = `${toBn(d.getDate())} ${MONTHS[d.getMonth()]}`
  return withDay ? `${s}, ${DAYS[d.getDay()]}` : s
}

/** আজ / গতকাল / ২৬ আগস্ট */
export function dayLabelBn(iso: string): string {
  const t = isoDate()
  if (iso === t) return 'আজ'
  if (iso === addDays(t, -1)) return 'গতকাল'
  if (iso === addDays(t, -2)) return 'পরশু'
  if (iso === addDays(t, 1)) return 'আগামীকাল'
  return dateBn(iso, false)
}

/** "৪ ঘণ্টা আগে" — for the brief's generated_at */
export function agoBn(isoTs: string): string {
  const then = new Date(isoTs).getTime()
  if (!Number.isFinite(then)) return '—'
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 2) return 'এইমাত্র'
  if (mins < 60) return `${toBn(mins)} মিনিট আগে`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${toBn(hrs)} ঘণ্টা আগে`
  const d = Math.floor(hrs / 24)
  return `${toBn(d)} দিন আগে`
}

export function hoursSince(isoTs: string): number {
  const then = new Date(isoTs).getTime()
  if (!Number.isFinite(then)) return Infinity
  return (Date.now() - then) / 3600000
}
