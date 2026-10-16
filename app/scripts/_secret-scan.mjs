/* What must never be inside a public APK. Reports labels and file names only —
   never the value, so the output itself is safe to paste anywhere. */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const TEXT = /\.(js|mjs|css|html|json|map|txt)$/i
const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{20,}/],
  // Quoted on purpose: a device key or a hash sits in the bundle as a string;
  // long hex inside a longer word is a library's, not ours.
  ['48-hex device key', /["'`][0-9a-f]{48}["'`]/],
  ['64-hex hash', /["'`][0-9a-f]{64}["'`]/],
]

/** The secrets this machine actually holds, so a leak is caught by value too. */
export function knownSecrets(dir = join(homedir(), '.site-khata')) {
  const out = []
  const add = (label, v) => { v = String(v ?? '').trim(); if (v.length >= 16) out.push([label, v]) }
  const read = (f) => { try { return readFileSync(join(dir, f), 'utf8') } catch { return '' } }
  add('site-token.txt', read('site-token.txt'))
  for (const line of read('gemini.env').split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/)
    if (m) add('gemini.env value', m[1].replace(/^["']|["']$/g, ''))
  }
  try { add('admin token (nightly.json)', JSON.parse(read('nightly.json') || '{}').admin_token) } catch { /* not JSON: skip */ }
  return out
}

const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

export function findSecrets(dir, known = []) {
  if (!existsSync(dir)) return []
  const hits = []
  for (const f of walk(dir)) {
    if (!TEXT.test(f)) continue
    const s = readFileSync(f, 'utf8')
    for (const [what, re] of PATTERNS) if (re.test(s)) hits.push({ file: f, what })
    for (const [what, v] of known) if (s.includes(v)) hits.push({ file: f, what })
  }
  return hits
}
