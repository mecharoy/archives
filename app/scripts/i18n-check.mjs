/* Is every Bengali sentence in the screens also in the English dictionary?

   The English switch falls back to Bengali for any string it has no entry for, so a missing entry never
   crashes — it just leaves a Bengali sentence on an English screen (the cash page did, for months). This
   reads every Bengali string literal in src/screens, src/ui and src/lib and reports the ones English does
   not know, with file and line.

   A string that is only ever shown after being passed through t() elsewhere is still a literal here, so it
   is checked too; strings that are data on purpose (stored heads, stage names seeded from the catalogue) are
   covered by the dictionary or the catalogue already. A few are exempt below, each with the reason. */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { loadApp, ROOT } from './_app.mjs'

const app = await loadApp()
const { i18n } = app

/* Exempt on purpose. */
const EXEMPT = new Set([
  'বাংলা',          // the name of the language, shown in its own script on the language page
])

const files = []
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(f) && !/^(en|catalog)\.ts$/.test(f)) files.push(p)
  }
}
for (const d of ['src/screens', 'src/ui', 'src/lib']) walk(join(ROOT, d))
files.splice(0, files.length, ...files.filter((f) => !/[\\/]bn\.ts$/.test(f)))   // bn.ts holds the month and day names for both languages and the digit table
files.push(join(ROOT, 'src/App.tsx'))

const BN = /[ঀ-৿]/
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g

i18n.setLang('en')
const missing = new Map()   // key -> [file:line]
let checked = 0
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  let inBlock = false
  lines.forEach((line, i) => {
    // comments, including the lines in the middle of a /* ... */ block
    const wasIn = inBlock
    if (!inBlock && /\/\*/.test(line) && !/\*\//.test(line.slice(line.indexOf('/*') + 2))) inBlock = true
    else if (inBlock && /\*\//.test(line)) inBlock = false
    if (wasIn || /^\s*(\/\/|\*|\/\*)/.test(line)) return
    let m
    LITERAL.lastIndex = 0
    while ((m = LITERAL.exec(line))) {
      const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"')
      if (!BN.test(key) || key.includes('${') || EXEMPT.has(key)) continue
      checked++
      const got = i18n.t(key)
      if (got === key) {
        const at = `${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}`
        if (!missing.has(key)) missing.set(key, [])
        missing.get(key).push(at)
      }
    }
  })
}

console.log(`${checked} Bengali strings checked in ${files.length} files`)
if (!missing.size) { console.log('ok   every Bengali string has an English entry'); process.exit(0) }
console.log(`FAIL ${missing.size} strings have no English:`)
for (const [k, at] of missing) console.log(`  ${JSON.stringify(k)}  ${at[0]}${at.length > 1 ? ` +${at.length - 1}` : ''}`)
process.exit(1)
