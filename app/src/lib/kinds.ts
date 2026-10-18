/* Kinds of work. A job is not always a house: it can be painting, sanitary work, a repair, or something
   else. Each kind has its own steps, each step its share of the whole job (adding to 100). The steps only
   name the part of the job a percentage falls in; how far a job has got is the evening's slider.

   The lists are ordinary starting points, editable in কাজ → কাজের ধাপ. The house's eight steps and their ids
   are the ones every phone has had since the first build; the other kinds' ids are fixed too, so a second
   phone or a restore merges into the same rows instead of making a second set. */

import type { Stage } from './model'

export const HOUSE = 'ঘর'

export interface Kind { key: string; code: string; label_bn: string; stages: [string, number][] }

export const KINDS: Kind[] = [
  {
    key: HOUSE, code: 'house', label_bn: 'নতুন বাড়ি',
    stages: [['ভিত ও মাটি কাটা', 8], ['ফাউন্ডেশন ও কলাম', 15], ['প্লিন্থ ঢালাই', 10], ['দেওয়াল গাঁথনি', 15],
      ['ছাদ ঢালাই', 18], ['প্লাস্টার', 12], ['দরজা-জানালা, লাইন', 12], ['রং ও ফিনিশিং', 10]],
  },
  // The key stays রং; on screen it is রঙের কাজ, because রং alone is the settings' word for colour.
  { key: 'রং', code: 'paint', label_bn: 'রঙের কাজ', stages: [['ঘষা ও পুটি', 35], ['প্রাইমার', 15], ['প্রথম কোট', 25], ['শেষ কোট', 25]] },
  { key: 'স্যানিটারি', code: 'sanitary', label_bn: 'স্যানিটারি', stages: [['পাইপের লাইন', 40], ['প্যান-বেসিন ও ফিটিংস', 35], ['জল দিয়ে পরীক্ষা', 10], ['শেষ কাজ', 15]] },
  { key: 'মেরামত', code: 'repair', label_bn: 'মেরামত', stages: [['ভাঙা ও সরানো', 15], ['গাঁথনি ও প্লাস্টার', 35], ['মেঝে ও টাইল', 25], ['রং ও শেষ কাজ', 25]] },
  { key: 'অন্য কাজ', code: 'other', label_bn: 'অন্য কাজ', stages: [['পুরো কাজ', 100]] },
]

/** What a kind is called on screen. A kind he made up himself shows as he wrote it. */
export function kindLabel(key: string): string {
  return KINDS.find((k) => k.key === key)?.label_bn ?? key
}

/** The fixed id of a seeded step. The house keeps the ids it has always had. */
export function kindStageId(key: string, seq: number): string {
  if (key === HOUSE) return 'seed-stage-' + seq
  const k = KINDS.find((x) => x.key === key)
  return 'seed-stage-' + (k ? k.code : key) + '-' + seq
}

/** A kind's steps, in order: his own when any are saved, else the starting list (usable before seeding). */
export function kindStages(stages: Stage[], key: string): { seq: number; name_bn: string; weight: number }[] {
  const mine = stages.filter((s) => s.project_type === key).sort((a, b) => a.seq - b.seq)
  if (mine.length) return mine.map((s) => ({ seq: s.seq, name_bn: s.name_bn, weight: s.weight }))
  const k = KINDS.find((x) => x.key === key)
  return k ? k.stages.map(([name_bn, weight], i) => ({ seq: i + 1, name_bn, weight })) : []
}
