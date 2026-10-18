/* The order of the evening's questions, as a plain function of the draft — so it can be checked without a
   phone, and so the screens never decide it on their own.

   First "which jobs today?" (when there is a job to pick, or men at the shop). Then, job by job in the order
   he ticked them: who came, their wages (only if anyone came), material, other spending, money for this job,
   and how far it has got. The shop's own men get only the first two. Then, once for the whole day: goods for
   the shop (if he runs one), his own spending, the cash, and a last look. */

import type { ID } from './model'
import type { Draft } from './draft'

export type StepKind = 'pick' | 'men' | 'wages' | 'mat' | 'exp' | 'recv' | 'pct' | 'shop' | 'own' | 'cash' | 'review'

/** A step of the evening. `site` is the index into draft.sites for a job's own questions. */
export interface DayStep { key: string; kind: StepKind; site?: number }

export function daySteps(o: { draft: Draft; jobs: number; hasMen: boolean; runsShop: boolean }): DayStep[] {
  const out: DayStep[] = []
  if (o.jobs > 0 || (o.runsShop && o.hasMen)) out.push({ key: 'pick', kind: 'pick' })
  o.draft.sites.forEach((s, i) => {
    if (o.hasMen) out.push({ key: `men:${i}`, kind: 'men', site: i })
    if (Object.keys(s.att).length) out.push({ key: `wages:${i}`, kind: 'wages', site: i })
    if (s.project_id) for (const kind of ['mat', 'exp', 'recv', 'pct'] as const) out.push({ key: `${kind}:${i}`, kind, site: i })
  })
  if (o.runsShop) out.push({ key: 'shop', kind: 'shop' })
  out.push({ key: 'own', kind: 'own' }, { key: 'cash', kind: 'cash' }, { key: 'review', kind: 'review' })
  return out
}

/** Men already written at another of tonight's jobs: shown at this one as "already written", and not
    pre-ticked, so one man's day is not paid twice by accident. */
export function menElsewhere(d: Draft, site: number): Set<ID> {
  const out = new Set<ID>()
  d.sites.forEach((s, i) => { if (i !== site) for (const w of Object.keys(s.att)) out.add(w) })
  return out
}
