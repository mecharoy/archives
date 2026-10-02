/* A believable year-in-progress for the screen checks: real-looking Bengali names, some of them long
   on purpose (a long name is where a layout breaks), a few bills, a brief and a few website enquiries. */

import { genLedger, HOUSE } from './_ledger.mjs'
import { rng } from './_app.mjs'

const ITEMS = [
  ['সিমেন্ট', 'বস্তা'], ['রড', 'কেজি'], ['ইট', 'পিস'], ['বালি', 'ঘনফুট'], ['স্টোন চিপস', 'ঘনফুট'],
  ['পাইপ (আধা ইঞ্চি)', 'পিস'], ['বৈদ্যুতিক তার (২.৫ মিমি, ৯০ মিটার)', 'বান্ডিল'], ['ওয়াটারপ্রুফ এক্সটেরিয়র রং', 'লিটার'], ['সুপার লং ফ্লোর টাইলস ২x২', 'বাক্স'],
]
const WORKERS = ['রহিম শেখ', 'গোপাল দাস', 'সুকুমার মণ্ডল', 'হারাধন বিশ্বাস', 'বিশু']
const SUPPLIERS = ['শর্মা ট্রেডার্স', 'মা তারা হার্ডওয়্যার অ্যান্ড স্যানিটারি', 'নিউ ভারত সিমেন্ট এজেন্সি', 'দাস ইলেকট্রিক']
const CLIENTS = ['সুবীর রায়', 'মণ্ডল স্টোর্স', 'আব্দুল করিম']
const JOBS = [['রায়বাড়ি — দোতলা বাড়ি', 'সুবীর রায়'], ['মণ্ডল ভবন', 'শ্রীমতী মণ্ডল'], ['স্টেশন রোড দোকানঘর', '']]

export function demoData(app, today, events = 140) {
  const r = rng(20261002)
  const L = genLedger(app, r, events, { today, projects: 3, parties: 4, items: 9, horizon: 60, ties: 0 })
  let i = 0
  for (const m of L.masters) {
    if (m.kind === 'item') { const [n, u] = ITEMS[i++ % ITEMS.length]; m.name_bn = n; m.unit_bn = u; m.last_rate = m.last_rate ?? 120 }
  }
  const take = (kind, ptype, names, key = 'name_bn') => L.masters.filter((m) => m.kind === kind && (!ptype || m.ptype === ptype)).forEach((m, k) => { m[key] = names[k % names.length] })
  take('worker', null, WORKERS)
  take('party', 'supplier', SUPPLIERS)
  take('party', 'client', CLIENTS)
  L.masters.filter((m) => m.kind === 'project').forEach((m, k) => { const [n, c] = JOBS[k % JOBS.length]; m.name_bn = n; m.client_bn = c; m.ptype = HOUSE; m.status = k === 2 ? 'done' : 'active'; m.budget = [2800000, 1500000, 600000][k % 3] })
  L.masters.filter((m) => m.kind === 'stage').forEach((m, k) => { m.name_bn = ['ভিত ও মাটি কাটা', 'ফাউন্ডেশন ও কলাম', 'ছাদ ঢালাই', 'দেওয়াল গাঁথনি'][k % 4] })

  const d = (k) => app.bn.addDays(today, -k)
  const bill = (id, name, to, amount, due, repeat, personal) => ({ id, kind: 'bill', name_bn: name, to_bn: to, amount, due_date: due, repeat, personal, paid_on: '', note: '', updated_at: new Date().toISOString() })
  L.masters.push(
    bill('bl1', 'দোকান ভাড়া', 'গৌতম সাহা', 12000, d(-3), 'monthly', false),
    bill('bl2', 'ছেলের স্কুলের মাসিক বেতন ও বাসভাড়া', 'সেন্ট জেভিয়ার্স', 3500, d(2), 'monthly', true),
    bill('bl3', 'বিদ্যুৎ বিল', 'WBSEDCL', 2140, d(-6), 'once', false),
  )

  const brief = {
    generated_at: new Date().toISOString(), by: 'model',
    headline_bn: 'রায়বাড়ির খরচ কাজের থেকে এগিয়ে — তিন দিন কোনো হিসাব লেখা হয়নি, আর শর্মা ট্রেডার্সের পাওনা দু’সপ্তাহ পেরিয়ে গেছে।',
    headline_en: 'Rai house spending is ahead of the work — nothing written for three days, and Sharma Traders is two weeks overdue.',
    cards: [
      { label_bn: 'হাতে নগদ', label_en: 'Cash in hand', value: '₹৪৮,২০০', status: 'ok' },
      { label_bn: 'দিতে হবে', label_en: 'To pay', value: '₹১,২৩,৪৫,৬৭৮', sub_bn: 'পেরিয়ে গেছে ₹৪০,০০০', sub_en: '₹40,000 overdue', status: 'crit' },
      { label_bn: 'পাবেন', label_en: 'To receive', value: '₹১,০০০', status: 'warn' },
      { label_bn: 'দোকানের মাল', label_en: 'Shop stock', value: '₹১৪,০০০', status: 'ok' },
      { label_bn: 'এই সপ্তাহের খরচ', label_en: 'Spent this week', value: '₹৩২,৫০০', sub_bn: 'আগের সপ্তাহের থেকে ১২% বেশি', sub_en: '12% up on last week', status: 'info' },
      { label_bn: 'লেখা হয়নি', label_en: 'Nothing written', value: '৩ দিন', status: 'warn' },
    ],
    projects: [
      { name_bn: 'রায়বাড়ি — দোতলা বাড়ি', name_en: 'Rai house', pct_done: 42, pct_spent: 61, status: 'crit', note_bn: 'খরচ কাজের অনেক আগে', note_en: 'Spending well ahead' },
      { name_bn: 'মণ্ডল ভবন', name_en: 'Mondal building', pct_done: 70, pct_spent: 66, status: 'ok' },
    ],
    alerts: [
      { severity: 'crit', text_bn: 'শর্মা ট্রেডার্সকে ₹৪০,০০০ দেওয়ার তারিখ পেরিয়ে গেছে।', text_en: 'Sharma Traders is owed ₹40,000, past its date.' },
      { severity: 'warn', text_bn: 'সিমেন্টের খরচ ধাপের হিসাবের থেকে বেশি।', text_en: 'Cement use is above the stage estimate.' },
    ],
    series: {
      scurve: { days: [0, 10, 20, 30, 40, 50], plan: [0, 2, 5, 9, 14, 20], actual: [0, 3, 7, 12, 18, 25], unit: 'লাখ' },
      burn: [{ item_bn: 'সিমেন্ট', item_en: 'Cement', pct: 88, status: 'crit' }, { item_bn: 'রড', item_en: 'Steel', pct: 45, status: 'ok' }],
    },
    todo_bn: ['শর্মা ট্রেডার্সকে ফোন করুন', 'আজকের হিসাব লিখুন'],
    todo_en: ['Call Sharma Traders', 'Write today’s entries'],
  }

  const enquiries = [
    { id: 'q1', received_at: new Date().toISOString(), name: 'অনিমেষ চক্রবর্তী', phone: '+919830012345', email: '', location: 'বারাসাত', service: 'বাড়ি তৈরি', message: 'দোতলা বাড়ির জন্য একটা আনুমানিক খরচ জানতে চাই। জমি ৩ কাঠা।', locale: 'bn' },
    { id: 'q2', received_at: new Date(Date.now() - 86400000).toISOString(), name: 'A very long visitor name that keeps going and going Chattopadhyay', phone: '9830098300', email: 'someone.with.a.long.address@example-company-name.co.in', location: 'Salt Lake, Sector V, near the City Centre metro station', service: 'Hardware shop', message: 'Please call back. '.repeat(14), locale: 'en' },
    { id: 'q3', received_at: new Date(Date.now() - 3 * 86400000).toISOString(), name: 'সঞ্জয়', phone: '', email: 'sanjoy@example.com', location: '', service: '', message: '', locale: 'bn' },
  ]
  return { ...L, brief, enquiries }
}
