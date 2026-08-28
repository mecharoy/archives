/* Two languages over one set of words.

   Bengali is the source. Every string the app shows is written in Bengali in
   the code, and English is a lookup away from it — so a missing translation
   shows his own language rather than a blank or a key name, and adding a
   screen cannot break the English build.

   What is NEVER translated: anything stored in the ledger. Expense heads,
   units and item names are written to disk in Bengali whatever the setting,
   and turned into English only on their way to the screen. A phone switched
   to English and back must produce the same rows, byte for byte. */

import { CATALOG } from './catalog'
import { EN as DICT } from './en'

export type Lang = 'bn' | 'en'

let current: Lang = 'bn'

export function setLang(l: Lang): void { current = l }
export function getLang(): Lang { return current }
export function isEn(): boolean { return current === 'en' }

/* Bengali → English lives in its own file; it is long, and it is a list of
   words rather than logic. */
const EN: Record<string, string> = { ...DICT }

/* The goods list carries its own English, so the catalogue and the dictionary
   cannot drift apart. Stage names seeded with a new house do the same. */
for (const c of CATALOG) EN[c.name_bn] = c.name_en

export function addTranslations(more: Record<string, string>): void {
  for (const [k, v] of Object.entries(more)) EN[k] = v
}

/** The Bengali string is the key. Unknown or untranslated → Bengali, always. */
export function t(bn: string): string {
  if (current === 'bn') return bn
  return EN[bn] ?? EN[bn.trim()] ?? bn
}

/** For the nightly brief, which arrives with both languages in it: take the
    English only when English is on and the model actually wrote some. */
export function pick(bn?: string, en?: string): string {
  if (current === 'en' && en && en.trim()) return en
  return bn || ''
}

/** For a string built at runtime: t2('… {0} …', x). Bengali template is key. */
export function tf(bn: string, ...args: (string | number | undefined)[]): string {
  return args.reduce<string>((s, a, i) => s.split(`{${i}}`).join(a == null ? '' : String(a)), t(bn))
}
