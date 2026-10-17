/* Starting points for the two tables he cannot be expected to invent: the
   stages of a house and the thumb rules that turn square feet into bags of
   cement. These are ordinary trade figures for a small RCC house in West
   Bengal, offered once, editable everywhere, and corrected over time by what
   his own jobs actually consume. They are never used as wizard suggestions. */

import { saveMaster } from './store'
import type { Stage, Coeff, Item } from './model'

export const HOUSE = 'ঘর'

const STAGES: [string, number][] = [
  ['ভিত ও মাটি কাটা', 8],
  ['ফাউন্ডেশন ও কলাম', 15],
  ['প্লিন্থ ঢালাই', 10],
  ['দেওয়াল গাঁথনি', 15],
  ['ছাদ ঢালাই', 18],
  ['প্লাস্টার', 12],
  ['দরজা-জানালা, লাইন', 12],
  ['রং ও ফিনিশিং', 10],
]

/** The same list, numbered as seedHouse numbers it — for setting up a job before anything is seeded. */
export const HOUSE_STAGES = STAGES.map(([name_bn], i) => ({ seq: i + 1, name_bn }))

const COEFFS: [string, string, number][] = [
  ['সিমেন্ট', 'বস্তা', 0.4],
  ['রড', 'কেজি', 3.5],
  ['ইট', 'পিস', 8],
  ['বালি', 'ঘনফুট', 1.2],
  ['স্টোন চিপস', 'ঘনফুট', 0.65],
]

export async function seedHouse(existingItems: Item[]): Promise<void> {
  const now = new Date().toISOString()
  let seq = 1
  for (const [name_bn, weight] of STAGES) {
    // Fixed ids: seeding twice (a second phone on the same online ledger, a restore afterwards) merges
    // into the same rows instead of making a second set whose weights add up to 200.
    await saveMaster({ id: 'seed-stage-' + seq, kind: 'stage', project_type: HOUSE, seq: seq++, name_bn, weight, updated_at: now } as Stage)
  }
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
