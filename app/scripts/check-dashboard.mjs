/* The dashboard is one big template literal that emits a page with an inline
   <script> in it. That means every backslash in the emitted JavaScript has to
   survive two passes: `'\n'` written in the source becomes a real newline in
   the page, which ends a string mid-line and breaks the whole script — the
   page then loads, shows the token box, and does nothing at all when you press
   the button. It has happened twice.

   So: build the page, pull the script out, and parse it. No server needed. */

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { dashboardHtml } from '../server/src/dashboard.js'

const html = dashboardHtml()
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
if (!script) {
  console.log('FAIL dashboard has no inline script')
  process.exit(1)
}

const tmp = join(tmpdir(), 'site-khata-dashboard-check.mjs')
writeFileSync(tmp, script)
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
  console.log('ok   the dashboard’s inline script parses')
} catch (e) {
  console.log('FAIL the dashboard’s inline script does not parse:')
  console.log(String(e.stderr || e.stdout || e.message).split('\n').slice(0, 6).join('\n'))
  process.exit(1)
} finally {
  try { unlinkSync(tmp) } catch { /* nothing to clean */ }
}

/* A second, narrower trap: a lone apostrophe inside a single-quoted string in
   the emitted script. It parses only by luck of what follows it. */
const stray = [...script.matchAll(/[A-Za-z]'[A-Za-z]/g)].map((m) => m[0])
if (stray.length) {
  console.log('FAIL apostrophes inside the emitted script: ' + stray.join(', '))
  process.exit(1)
}
console.log('ok   no stray apostrophes in it')

/* And the page must still carry the things the workflow depends on. */
for (const [what, needle] of [
  ['the token box', 'id="tok"'],
  ['the copy button', 'id="copysum"'],
  ['the publish button', 'id="publish"'],
  ['both-language instructions', '*_en'],
]) {
  if (!html.includes(needle)) { console.log('FAIL the page lost ' + what); process.exit(1) }
  console.log('ok   the page still has ' + what)
}

const src = readFileSync(new URL('../server/src/dashboard.js', import.meta.url), 'utf8')
if (!src.includes('receivable_overdue')) {
  console.log('FAIL the prompt no longer mentions receivables')
  process.exit(1)
}
console.log('ok   the prompt still flags receivables')
