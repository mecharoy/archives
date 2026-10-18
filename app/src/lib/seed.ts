/* Starting points for the two tables he cannot be expected to invent: the
   steps of each kind of work (kinds.ts) and the thumb rules that turn square
   feet into bags of cement. These are ordinary trade figures for a small RCC
   house in West Bengal, offered once, editable everywhere, and corrected over
   time by what his own jobs actually consume. They are never used as wizard
   suggestions. */

import { saveMaster } from './store'
import type { Stage, Coeff, Item } from './model'
import { HOUSE, KINDS, kindStageId } from './kinds'

export { HOUSE }

/** The house's steps, numbered as they are seeded — for setting up a job before anything is seeded. */
export const HOUSE_STAGES = KINDS[0].stages.map(([name_bn], i) => ({ seq: i + 1, name_bn }))

const COEFFS: [string, string, number][] = [
  ['সিমেন্ট', 'বস্তা', 0.4],
  ['রড', 'কেজি', 3.5],
  ['ইট', 'পিস', 8],
  ['বালি', 'ঘনফুট', 1.2],
  ['স্টোন চিপস', 'ঘনফুট', 0.65],
]

/** Every kind's steps, and the house's thumb rules. Fixed ids: seeding twice (a second phone on the same
    online ledger, a restore afterwards) merges into the same rows instead of making a second set whose
    weights add up to 200. `only` leaves out what is already there, so a phone set up by an older build
    gains the new kinds without its own edited steps being written over. */
export async function seedKinds(existingItems: Item[], existingStages: Stage[] = [], only?: 'missing'): Promise<void> {
  const now = new Date().toISOString()
  for (const k of KINDS) {
    if (only === 'missing' && existingStages.some((s) => s.project_type === k.key)) continue
    let seq = 1
    for (const [name_bn, weight] of k.stages) {
      await saveMaster({ id: kindStageId(k.key, seq), kind: 'stage', project_type: k.key, seq: seq++, name_bn, weight, updated_at: now } as Stage)
    }
  }
  if (only === 'missing') return
  let n = 0
  for (const [name_bn, unit_bn, per_sqft] of COEFFS) {
    n++
    let item = existingItems.find((i) => i.name_bn === name_bn)
    if (!item) {
      item = { id: 'seed-item-' + n, kind: 'item', name_bn, unit_bn, last_rate: null, active: true, updated_at: now } as Item
      await saveMaster(item)
    }
    await saveMaster({ id: 'seed-coeff-' + n, kind: 'coeff', project_type: HOUSE, item_id: item.id, per_sqft, updated_at: now } as Coeff)
  }
}

/** The name the first setup has always called. */
export const seedHouse = (existingItems: Item[]) => seedKinds(existingItems)
