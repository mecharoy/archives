/* Loads the app's own TypeScript (calc, model, draft, …) for the node checks.
   Nothing is re-implemented: vite bundles the real files into a temp folder and
   they are imported from there. Shared by the fuzz and large-ledger checks. */

import { build } from 'vite'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import initSqlJs from 'sql.js'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ENTRIES = ['calc', 'model', 'draft', 'bn', 'monthly', 'restore', 'sync', 'remind', 'i18n']

export async function loadApp() {
  const out = mkdtempSync(join(tmpdir(), 'sitekhata-app-'))
  await build({
    configFile: false, logLevel: 'error', root: ROOT,
    build: {
      outDir: out, emptyOutDir: true, minify: false, target: 'es2022', sourcemap: false,
      lib: { entry: Object.fromEntries(ENTRIES.map((n) => [n, `src/lib/${n}.ts`])), formats: ['es'] },
    },
  })
  const mods = await Promise.all(ENTRIES.map((n) => import(pathToFileURL(join(out, n + '.js')).href)))
  const app = Object.fromEntries(ENTRIES.map((n, i) => [n, mods[i]]))
  const SQL = await initSqlJs()
  const schemaSql = readFileSync(join(ROOT, 'server/schema.sql'), 'utf8')
  return { ...app, SQL, schemaSql, ROOT }
}

/* A clock that stands still, so "today" is the same in every case. */
const RealDate = Date
export function freeze(iso) {
  const t0 = RealDate.parse(iso)
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(t0); else super(...a) }
    static now() { return t0 }
  }
}
export const thaw = () => { globalThis.Date = RealDate }
export { RealDate }

/* A small seeded random source: the same seed always gives the same run. */
export function rng(seed) {
  let a = seed >>> 0
  const f = () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const r = {
    f,
    int: (lo, hi) => lo + Math.floor(f() * (hi - lo + 1)),
    chance: (p) => f() < p,
    pick: (xs) => xs[Math.floor(f() * xs.length)],
    /** a money amount to whole paise */
    money: (lo, hi) => Math.round((lo + f() * (hi - lo)) * 100) / 100,
    shuffle: (xs) => {
      const o = [...xs]
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [o[i], o[j]] = [o[j], o[i]] }
      return o
    },
    hex: (n = 8) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(f() * 16)]).join(''),
  }
  return r
}
