/* The update path, checked without a phone and without the network.

   The failure that matters here is quiet and expensive: a manifest the phone
   reads as "older than what I have", or "not a release at all", means he is
   simply never offered the fix — and nothing anywhere reports a problem. So
   this asserts the comparison and the whitelist directly, and then asserts
   the published manifest agrees with the APK sitting beside it.

   `npm run update:check`, and it runs as part of `npm test`. */

import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}

/* ---------- the whitelist, lifted from src/lib/update.ts ----------
   Kept as one small function so the rules can be exercised without a browser;
   if the real one changes shape, the assertions below stop matching it and
   this file is the reminder. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '')
function parseManifest(raw) {
  if (!raw || typeof raw !== 'object') return null
  const code = num(raw.code)
  const url = str(raw.url, 400)
  if (code <= 0 || !/^https:\/\//.test(url)) return null
  return {
    code, name: str(raw.name, 20) || String(code), url,
    size: num(raw.size) || undefined,
    notes_bn: str(raw.notes_bn), notes_en: str(raw.notes_en),
  }
}
const isNewer = (there, here) => Boolean(there) && there.code > here.code

/* ---------- a release is only a release if it can be installed ---------- */

ck('a good manifest parses', Boolean(parseManifest({ code: 4, name: '1.0.4', url: 'https://x/y.apk' })), 'true')
ck('no build number is not a release', parseManifest({ name: '1.0.4', url: 'https://x/y.apk' }), 'null')
ck('a zero build number is not a release', parseManifest({ code: 0, url: 'https://x/y.apk' }), 'null')
ck('no file is not a release', parseManifest({ code: 4 }), 'null')
ck('a plain-http file is refused', parseManifest({ code: 4, url: 'http://x/y.apk' }), 'null')
ck('junk is refused rather than thrown at', parseManifest('nonsense'), 'null')
ck('the name falls back to the number', parseManifest({ code: 7, url: 'https://x/y.apk' }).name, '7')

/* ---------- the comparison, which decides whether he is ever told ---------- */

const here = { code: 3, name: '1.0.3' }
ck('a higher build is offered', isNewer({ code: 4 }, here), 'true')
ck('the same build is not', isNewer({ code: 3 }, here), 'false')
ck('an older build is not', isNewer({ code: 2 }, here), 'false')
ck('an unreadable manifest is not', isNewer(null, here), 'false')

/* ---------- and the published pair have to agree ---------- */

const dir = join(process.cwd(), 'dist-apk')
const manifestPath = join(dir, 'latest.json')

if (!existsSync(manifestPath)) {
  console.log('ok   no release published yet — nothing to cross-check')
} else {
  const published = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
  ck('the published manifest is a valid release', Boolean(published), 'true')

  const gradle = readFileSync(join(process.cwd(), 'android/app/build.gradle'), 'utf8')
  const built = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1])
  ck('it names the build that was actually compiled', published.code, built)

  const named = (gradle.match(/versionName\s+"([^"]*)"/) || [])[1]
  ck('and the version he sees matches too', published.name, named)

  /* The file the manifest points at must be the file in the folder — this is
     the check that catches a manifest written from a build that failed. */
  const apk = published.url.split('?')[0].split('/').pop()
  ck('the APK it points at is beside it', existsSync(join(dir, apk)), 'true')
  if (existsSync(join(dir, apk))) {
    ck('and is the size it claims', published.size, statSync(join(dir, apk)).size)
  }
  ck('the link carries a cache-buster', /[?&]build=/.test(published.url), 'true')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
