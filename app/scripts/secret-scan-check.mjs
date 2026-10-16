/* The release scanner must refuse secrets and pass ordinary long hex. */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findSecrets } from './_secret-scan.mjs'

const hex = (n, c) => c.repeat(n)
const dir = mkdtempSync(join(tmpdir(), 'sk-scan-'))
const fail = []
const known = [['test key', 'known-secret-value-1234567890']]

writeFileSync(join(dir, 'clean.js'), `const a = "hello"; const lib = x${hex(64, 'a')}y; const short = "${hex(40, 'b')}"`)
if (findSecrets(dir, known).length) fail.push('clean bundle refused')

writeFileSync(join(dir, 'token.js'), `export const d = { token: "${hex(48, 'c')}" }`)
if (!findSecrets(dir, known).some((h) => h.what.includes('48-hex'))) fail.push('a quoted 48-hex key passed')

writeFileSync(join(dir, 'hash.js'), `const H = '${hex(64, 'd')}'`)
if (!findSecrets(dir, known).some((h) => h.what.includes('64-hex'))) fail.push('a quoted 64-hex hash passed')

writeFileSync(join(dir, 'google.js'), `k="AIza${'Q'.repeat(30)}"`)
if (!findSecrets(dir, known).some((h) => h.what.includes('Google'))) fail.push('a Google key passed')

writeFileSync(join(dir, 'known.json'), `{"x":"known-secret-value-1234567890"}`)
const hits = findSecrets(dir, known)
if (!hits.some((h) => h.what === 'test key')) fail.push('a known value passed')
if (JSON.stringify(hits).includes('known-secret-value')) fail.push('a secret value was echoed in the result')

console.log(fail.length ? 'FAIL ' + fail.join('; ') : 'ok   secret scan: refuses keys, hashes, Google keys and known values; passes plain hex')
process.exit(fail.length ? 1 : 0)
