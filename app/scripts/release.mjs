/* Cut a release his phone will offer him.

   The whole update mechanism turns on one number going up. Doing that by hand
   is how you ship a build that claims to be older than the one already
   installed and is therefore never offered — so this script owns it:

     npm run release -- "যা বদলাল" "What changed"

   It bumps the build number in build.gradle, builds the web bundle with the
   endpoint and token baked in, assembles the signed APK, copies it into
   dist-apk, and writes the latest.json beside it that the phone reads. The
   previous APK is moved to trash/ rather than overwritten, because it is out
   on a phone somewhere.

   Nothing is pushed. Check the diff, then commit — the phone only ever sees
   what is on the branch. */

import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'

const APP = process.cwd()
const GRADLE = join(APP, 'android/app/build.gradle')
const OUT = join(APP, 'dist-apk')
const APK_NAME = 'SiteKhata-1.0.apk'
const BUILT = join(APP, 'android/app/build/outputs/apk/release/app-release.apk')

/* Where the phone looks. Both are raw links to the branch, so a release is
   live the moment it is pushed — no hosting, no release page to publish. */
const RAW = 'https://raw.githubusercontent.com/mecharoy/archives/claude/app-development-apk-vlbobd/app/dist-apk'

const [notesBn = '', notesEn = ''] = process.argv.slice(2)

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: APP, shell: process.platform === 'win32', ...opts })

const assemble = () => {
  const dir = join(APP, 'android')
  const bat = process.platform === 'win32'
  // On Windows the wrapper is a .bat: Node will not spawn one without a
  // shell, and cmd.exe will not find it by bare name in the working
  // directory — so it takes both a shell and the full path. Elsewhere the
  // POSIX wrapper runs directly.
  execFileSync(join(dir, bat ? 'gradlew.bat' : 'gradlew'), ['assembleRelease'],
    { stdio: 'inherit', cwd: dir, shell: bat })
}

/* ---- 1. the number that makes all of this work ---- */

const before = readFileSync(GRADLE, 'utf8')
const codeMatch = before.match(/versionCode\s+(\d+)/)
if (!codeMatch) { console.error('versionCode not found in build.gradle'); process.exit(1) }
const code = Number(codeMatch[1]) + 1
const name = `1.0.${code}`

/* A release that does not finish must not leave the number advanced: the next
   attempt would skip a build, and the manifest would end up naming a build
   that was never compiled. */
process.on('exit', (status) => {
  if (status !== 0) {
    try { writeFileSync(GRADLE, before) } catch { /* nothing left to do */ }
    console.error(`\n✗ release ${code} did not finish. The build number is back at ${code - 1}.`)
  }
})

writeFileSync(GRADLE, before
  .replace(/versionCode\s+\d+/, `versionCode ${code}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${name}"`))
console.log(`\n→ build ${code}  (${name})\n`)

/* ---- 2. the bundle, with his credentials in it ---- */

if (!process.env.VITE_SYNC_ENDPOINT || !process.env.VITE_SYNC_TOKEN) {
  console.error('VITE_SYNC_ENDPOINT and VITE_SYNC_TOKEN must be set, or the APK ships unable to sync.')
  console.error('Both are readable out of the previous APK if you need them back.')
  process.exit(1)
}

// Write this build's number into a source file the bundle compiles, so the
// app knows its own version without the native bridge. A generated constant is
// dependable where a build-env var was not.
writeFileSync(join(APP, 'src/lib/buildinfo.ts'),
  `/* Written by scripts/release.mjs at release time. 0 in a dev build. */\nexport const BUILD_CODE = ${code}\n`)
run('npm', ['run', 'build'])
run('npx', ['cap', 'sync', 'android'])

/* ---- 3. the signed APK ---- */

assemble()
if (!existsSync(BUILT)) { console.error('no APK at ' + BUILT); process.exit(1) }

const dest = join(OUT, APK_NAME)
if (existsSync(dest)) renameSync(dest, join(APP, 'trash', `SiteKhata-prev-${code - 1}.apk`))
copyFileSync(BUILT, dest)
const size = statSync(dest).size

/* ---- 4. what the phone reads ---- */

/* The APK filename stays the same so the link already given to him never
   breaks; the build number in the query string is what defeats the caches
   between here and his phone. */
writeFileSync(join(OUT, 'latest.json'), JSON.stringify({
  code,
  name,
  url: `${RAW}/${APK_NAME}?build=${code}`,
  size,
  notes_bn: notesBn,
  notes_en: notesEn,
  released_at: new Date().toISOString(),
}, null, 2) + '\n')

console.log(`\n✓ build ${code} — ${(size / 1048576).toFixed(1)} MB`)
console.log(`  ${dest}`)
console.log(`  ${join(OUT, 'latest.json')}`)
if (!notesBn) console.log('\n  No notes given. His prompt will show the version and nothing else.')
console.log('\nCommit and push, and his phone will offer it within twelve hours.\n')
