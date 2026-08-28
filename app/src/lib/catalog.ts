/* A list of ordinary hardware-shop goods, offered only when he is adding a new
   item so he can tap instead of type. Nothing here becomes a master until he
   picks it, and nothing here is ever suggested during a day's entry — the
   wizard still only proposes what he has actually bought.

   Sizes are in inches, written the way they are said at the counter. Units are
   a starting point; every one of them is editable in সেটিংস → মাল.

   Each row carries its English name, and that is where the English screens get
   their words from — the item is stored under its Bengali name whichever
   language the phone is in, so switching back and forth changes nothing on
   disk. */

export interface CatalogItem { name_bn: string; name_en: string; unit_bn: string; cat: string }

export const CATS = ['পাইপ', 'ফিটিংস', 'ভালভ ও কল', 'বাথরুম', 'বিদ্যুৎ', 'নির্মাণ সামগ্রী', 'হার্ডওয়্যার', 'রং']

const PIPE_SIZES = ['১/২"', '৩/৪"', '১"', '১¼"', '১½"', '২"', '৩"', '৪"']
const EN_SIZE: Record<string, string> = {
  '১/২"': '1/2"', '৩/৪"': '3/4"', '১"': '1"', '১¼"': '1-1/4"', '১½"': '1-1/2"',
  '২"': '2"', '৩"': '3"', '৪"': '4"', '৬"': '6"',
  '৩/৪"×১/২"': '3/4"×1/2"', '১"×৩/৪"': '1"×3/4"', '১½"×১"': '1-1/2"×1"', '২"×১½"': '2"×1-1/2"',
}
const FIT_SIZES = ['১/২"', '৩/৪"', '১"', '১½"', '২"', '৩"', '৪"']
const VALVE_SIZES = ['১/২"', '৩/৪"', '১"']

function sized(bn: string, en: string, sizes: string[], unit_bn: string, cat: string): CatalogItem[] {
  return sizes.map((s) => ({ name_bn: `${bn} ${s}`, name_en: `${en} ${EN_SIZE[s] ?? s}`, unit_bn, cat }))
}

const PIPES: CatalogItem[] = [
  ...sized('পিভিসি পাইপ', 'PVC pipe', PIPE_SIZES, 'পিস', 'পাইপ'),
  ...sized('ইউপিভিসি পাইপ', 'UPVC pipe', PIPE_SIZES, 'পিস', 'পাইপ'),
  ...sized('সিপিভিসি পাইপ', 'CPVC pipe', ['১/২"', '৩/৪"', '১"'], 'পিস', 'পাইপ'),
  ...sized('জিআই পাইপ', 'GI pipe', ['১/২"', '৩/৪"', '১"', '১½"', '২"'], 'পিস', 'পাইপ'),
  ...sized('ড্রেন পাইপ', 'Drain pipe', ['২"', '৩"', '৪"', '৬"'], 'পিস', 'পাইপ'),
]

const FITTINGS: CatalogItem[] = [
  ...sized('কনুই', 'Elbow', FIT_SIZES, 'পিস', 'ফিটিংস'),
  ...sized('টি', 'Tee', FIT_SIZES, 'পিস', 'ফিটিংস'),
  ...sized('সকেট', 'Socket', FIT_SIZES, 'পিস', 'ফিটিংস'),
  ...sized('বেন্ড', 'Bend', ['১"', '১½"', '২"', '৩"', '৪"'], 'পিস', 'ফিটিংস'),
  ...sized('রিডিউসার', 'Reducer', ['৩/৪"×১/২"', '১"×৩/৪"', '১½"×১"', '২"×১½"'], 'পিস', 'ফিটিংস'),
  ...sized('ইউনিয়ন', 'Union', VALVE_SIZES, 'পিস', 'ফিটিংস'),
  ...sized('এন্ড ক্যাপ', 'End cap', FIT_SIZES, 'পিস', 'ফিটিংস'),
  ...sized('ট্যাংক নিপল', 'Tank nipple', VALVE_SIZES, 'পিস', 'ফিটিংস'),
  ...sized('ক্ল্যাম্প', 'Clamp', ['১/২"', '৩/৪"', '১"', '২"', '৪"'], 'পিস', 'ফিটিংস'),
  { name_bn: 'টেফলন টেপ', name_en: 'Teflon tape', unit_bn: 'পিস', cat: 'ফিটিংস' },
  { name_bn: 'সলিউশন গাম', name_en: 'Solvent cement', unit_bn: 'পিস', cat: 'ফিটিংস' },
]

const VALVES: CatalogItem[] = [
  ...sized('গেট ভালভ', 'Gate valve', VALVE_SIZES, 'পিস', 'ভালভ ও কল'),
  ...sized('বল ভালভ', 'Ball valve', VALVE_SIZES, 'পিস', 'ভালভ ও কল'),
  ...sized('চেক ভালভ', 'Check valve', VALVE_SIZES, 'পিস', 'ভালভ ও কল'),
  ...sized('ফুট ভালভ', 'Foot valve', ['১"', '১½"', '২"'], 'পিস', 'ভালভ ও কল'),
  ...sized('অ্যাঙ্গেল ভালভ', 'Angle valve', ['১/২"'], 'পিস', 'ভালভ ও কল'),
  ...sized('বিব কক (টেপ কল)', 'Bib cock (tap)', ['১/২"'], 'পিস', 'ভালভ ও কল'),
  ...sized('পিলার কক', 'Pillar cock', ['১/২"'], 'পিস', 'ভালভ ও কল'),
  ...sized('স্টপ কক', 'Stop cock', ['১/২"', '৩/৪"'], 'পিস', 'ভালভ ও কল'),
  { name_bn: 'বল কক (ট্যাংকের)', name_en: 'Ball cock (tank)', unit_bn: 'পিস', cat: 'ভালভ ও কল' },
  { name_bn: 'শাওয়ার', name_en: 'Shower', unit_bn: 'পিস', cat: 'ভালভ ও কল' },
  { name_bn: 'হেলথ ফসেট', name_en: 'Health faucet', unit_bn: 'পিস', cat: 'ভালভ ও কল' },
]

const BATH: CatalogItem[] = [
  { name_bn: 'বেসিন', name_en: 'Wash basin', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'কমোড', name_en: 'Commode', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'প্যান', name_en: 'Squat pan', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'সিস্টার্ন', name_en: 'Cistern', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'সিট কভার', name_en: 'Seat cover', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'ওয়েস্ট কাপলিং', name_en: 'Waste coupling', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'পি-ট্র্যাপ', name_en: 'P-trap', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'ফ্লোর ট্র্যাপ (জালি)', name_en: 'Floor trap (grating)', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'বাথরুমের আয়না', name_en: 'Bathroom mirror', unit_bn: 'পিস', cat: 'বাথরুম' },
  { name_bn: 'পিভিসি ট্যাংক', name_en: 'PVC water tank', unit_bn: 'পিস', cat: 'বাথরুম' },
]

const ELEC: CatalogItem[] = [
  ...sized('কনডুইট পাইপ', 'Conduit pipe', ['১/২"', '৩/৪"', '১"'], 'পিস', 'বিদ্যুৎ'),
  { name_bn: 'তার ১ মিমি', name_en: 'Wire 1 sq mm', unit_bn: 'মিটার', cat: 'বিদ্যুৎ' },
  { name_bn: 'তার ১.৫ মিমি', name_en: 'Wire 1.5 sq mm', unit_bn: 'মিটার', cat: 'বিদ্যুৎ' },
  { name_bn: 'তার ২.৫ মিমি', name_en: 'Wire 2.5 sq mm', unit_bn: 'মিটার', cat: 'বিদ্যুৎ' },
  { name_bn: 'তার ৪ মিমি', name_en: 'Wire 4 sq mm', unit_bn: 'মিটার', cat: 'বিদ্যুৎ' },
  { name_bn: 'সুইচ', name_en: 'Switch', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
  { name_bn: 'সকেট (প্লাগ পয়েন্ট)', name_en: 'Socket (plug point)', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
  { name_bn: 'হোল্ডার', name_en: 'Bulb holder', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
  { name_bn: 'সুইচ বোর্ড', name_en: 'Switch board', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
  { name_bn: 'এমসিবি', name_en: 'MCB', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
  { name_bn: 'এলইডি বাল্ব', name_en: 'LED bulb', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
  { name_bn: 'পাখা', name_en: 'Fan', unit_bn: 'পিস', cat: 'বিদ্যুৎ' },
]

const BUILD: CatalogItem[] = [
  { name_bn: 'সিমেন্ট', name_en: 'Cement', unit_bn: 'বস্তা', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'রড ৮ মিমি', name_en: 'Steel rod 8 mm', unit_bn: 'কেজি', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'রড ১০ মিমি', name_en: 'Steel rod 10 mm', unit_bn: 'কেজি', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'রড ১২ মিমি', name_en: 'Steel rod 12 mm', unit_bn: 'কেজি', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'রড ১৬ মিমি', name_en: 'Steel rod 16 mm', unit_bn: 'কেজি', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'ইট', name_en: 'Brick', unit_bn: 'পিস', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'বালি', name_en: 'Sand', unit_bn: 'ঘনফুট', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'স্টোন চিপস', name_en: 'Stone chips', unit_bn: 'ঘনফুট', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'স্টোন ডাস্ট', name_en: 'Stone dust', unit_bn: 'ঘনফুট', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'চুন', name_en: 'Lime', unit_bn: 'বস্তা', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'বাইন্ডিং তার', name_en: 'Binding wire', unit_bn: 'কেজি', cat: 'নির্মাণ সামগ্রী' },
  { name_bn: 'টাইলস', name_en: 'Tiles', unit_bn: 'বর্গফুট', cat: 'নির্মাণ সামগ্রী' },
]

const HARDWARE: CatalogItem[] = [
  { name_bn: 'পেরেক', name_en: 'Nails', unit_bn: 'কেজি', cat: 'হার্ডওয়্যার' },
  { name_bn: 'স্ক্রু', name_en: 'Screws', unit_bn: 'প্যাকেট', cat: 'হার্ডওয়্যার' },
  { name_bn: 'নাট-বল্টু', name_en: 'Nuts & bolts', unit_bn: 'কেজি', cat: 'হার্ডওয়্যার' },
  { name_bn: 'ওয়াশার', name_en: 'Washers', unit_bn: 'প্যাকেট', cat: 'হার্ডওয়্যার' },
  { name_bn: 'কব্জা', name_en: 'Hinges', unit_bn: 'পিস', cat: 'হার্ডওয়্যার' },
  { name_bn: 'ছিটকিনি', name_en: 'Door latch', unit_bn: 'পিস', cat: 'হার্ডওয়্যার' },
  { name_bn: 'তালা', name_en: 'Lock', unit_bn: 'পিস', cat: 'হার্ডওয়্যার' },
  { name_bn: 'দরজার হ্যান্ডেল', name_en: 'Door handle', unit_bn: 'পিস', cat: 'হার্ডওয়্যার' },
  { name_bn: 'হুক', name_en: 'Hook', unit_bn: 'পিস', cat: 'হার্ডওয়্যার' },
  { name_bn: 'র‍্যাপ প্লাগ', name_en: 'Wall plug', unit_bn: 'প্যাকেট', cat: 'হার্ডওয়্যার' },
]

const PAINT: CatalogItem[] = [
  { name_bn: 'প্রাইমার', name_en: 'Primer', unit_bn: 'লিটার', cat: 'রং' },
  { name_bn: 'পুটি', name_en: 'Wall putty', unit_bn: 'কেজি', cat: 'রং' },
  { name_bn: 'ডিসটেম্পার', name_en: 'Distemper', unit_bn: 'লিটার', cat: 'রং' },
  { name_bn: 'ইমালশন', name_en: 'Emulsion', unit_bn: 'লিটার', cat: 'রং' },
  { name_bn: 'এনামেল রং', name_en: 'Enamel paint', unit_bn: 'লিটার', cat: 'রং' },
  { name_bn: 'থিনার', name_en: 'Thinner', unit_bn: 'লিটার', cat: 'রং' },
  { name_bn: 'ব্রাশ', name_en: 'Brush', unit_bn: 'পিস', cat: 'রং' },
  { name_bn: 'রোলার', name_en: 'Roller', unit_bn: 'পিস', cat: 'রং' },
  { name_bn: 'শিরিষ কাগজ', name_en: 'Sandpaper', unit_bn: 'পিস', cat: 'রং' },
]

export const CATALOG: CatalogItem[] = [
  ...PIPES, ...FITTINGS, ...VALVES, ...BATH, ...ELEC, ...BUILD, ...HARDWARE, ...PAINT,
]

/* Substring match on either name, so টি finds the tees and "valve" finds the
   valves. `have` is what he already carries — those rows are in his own list
   already and would only be a second way to the same item. */
export function searchCatalog(q: string, cat: string | null, have: Set<string>): CatalogItem[] {
  const needle = q.trim().toLowerCase()
  return CATALOG.filter((c) => {
    if (have.has(c.name_bn)) return false
    if (needle) return c.name_bn.includes(q.trim()) || c.name_en.toLowerCase().includes(needle)
    return cat ? c.cat === cat : false
  })
}
