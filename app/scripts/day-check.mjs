/* The evening's own rules, checked without a browser: how far a job has got (the slider), and — from
   the next part on — how one evening holds several jobs and in what order it asks. */
process.env.TZ = 'Asia/Kolkata'
import { loadApp } from './_app.mjs'

const app = await loadApp()
const { calc } = app
let pass = 0, fail = 0
const ck = (name, got, want) => {
  if (String(got) === String(want)) { pass++; console.log('ok   ' + name) }
  else { fail++; console.log(`FAIL ${name} : expected [${want}] got [${got}]`) }
}
/* A rule that does not exist yet throws; that is a failure to report, not a reason to stop the run. */
const run = (fn) => { try { return fn() } catch (e) { return 'THREW ' + (e && e.message) } }

/* ---------- how far a job has got ---------- */

const HOUSE_STEPS = [['ভিত ও মাটি কাটা', 8], ['ফাউন্ডেশন ও কলাম', 15], ['প্লিন্থ ঢালাই', 10], ['দেওয়াল গাঁথনি', 15],
  ['ছাদ ঢালাই', 18], ['প্লাস্টার', 12], ['দরজা-জানালা, লাইন', 12], ['রং ও ফিনিশিং', 10]]
const stages = HOUSE_STEPS.map(([name_bn, weight], i) => ({ id: 'seed-stage-' + (i + 1), kind: 'stage', project_type: 'ঘর', seq: i + 1, name_bn, weight, updated_at: '' }))
stages.push({ id: 'k5-1', kind: 'stage', project_type: 'অন্য কাজ', seq: 1, name_bn: 'পুরো কাজ', weight: 100, updated_at: '' })
const house = stages.filter((s) => s.project_type === 'ঘর')
const job = { id: 'p1', kind: 'project', name_bn: 'রামপুরের বাড়ি', client_bn: '', ptype: 'ঘর', area_sqft: null, budget: 1000000, start_date: '2026-10-01', plan_days: null, status: 'active', updated_at: '' }
const other = { ...job, id: 'p2', name_bn: 'স্টেশন রোডের কাজ', ptype: 'অন্য কাজ' }

let n = 0
const prog = (o) => {
  n++
  return {
    id: o.id || 'g' + n, kind: 'progress', batch: 'b' + n, date: o.date, project_id: o.project_id || 'p1',
    created_at: o.created_at || o.date + 'T14:00:00.000Z', stage_seq: o.stage_seq ?? 0, state: o.state, pct: o.pct ?? 0,
    ...(o.reverses ? { reverses: o.reverses } : {}),
  }
}

const footing = prog({ date: '2026-10-02', stage_seq: 1, state: 'done' })
ck('no slider rows: the stage percent stands', run(() => calc.projectPct(job, [footing], stages)), 8)
ck('no slider rows: there is no slider figure', run(() => calc.sliderPct(job, [footing])), null)

const s55 = prog({ date: '2026-10-05', state: 'pct', pct: 55 })
const s60 = prog({ date: '2026-10-06', state: 'pct', pct: 60 })
ck("the latest slider row is the job's percent", run(() => calc.projectPct(job, [footing, s60, s55], stages)), 60)
ck('the job card reads the same figure', run(() => calc.projectTotals(job, [footing, s60, s55], stages).pct_done), 60)

const early = prog({ date: '2026-10-07', state: 'pct', pct: 70, created_at: '2026-10-07T13:00:00.000Z' })
const late = prog({ date: '2026-10-07', state: 'pct', pct: 65, created_at: '2026-10-07T15:00:00.000Z' })
ck('same day: the later created_at wins', run(() => calc.sliderPct(job, [late, early])), 65)

const undo60 = prog({ date: '2026-10-06', state: 'pct', pct: 0, reverses: s60.id })
ck('a cancelled slider row falls back to the one before', run(() => calc.sliderPct(job, [s55, s60, undo60])), 55)
ck("another job's slider is not this job's", run(() => calc.sliderPct(job, [prog({ project_id: 'p2', date: '2026-10-05', state: 'pct', pct: 30 })])), null)

ck('60% of a house is ছাদ ঢালাই', run(() => calc.stageAtPct(house, 60)?.name_bn), 'ছাদ ঢালাই')
ck('0% of a house is its first step', run(() => calc.stageAtPct(house, 0)?.name_bn), 'ভিত ও মাটি কাটা')
ck('8% is past the first step', run(() => calc.stageAtPct(house, 8)?.name_bn), 'ফাউন্ডেশন ও কলাম')
ck('100% means no step left', run(() => calc.stageAtPct(house, 100)), null)
ck("the job card's step follows the slider", run(() => calc.currentStage(job, [footing, s60], stages).current?.name_bn), 'ছাদ ঢালাই')
ck('a job of one step is as far as its slider says', run(() => calc.projectPct(other, [prog({ project_id: 'p2', date: '2026-10-05', state: 'pct', pct: 40 })], stages)), 40)

/* ---------- one evening, several jobs ---------- */

const { draft, day } = app
const full = (rate) => ({ presence: 'full', rate, amount: rate, advance: 0 })
const cement = (paid) => ({ key: 'm1', item_id: 'i1', qty: 10, rate: 380, party_id: 's1', due_date: paid ? '' : '2026-10-25', paid, photo_id: '' })
const tea = { key: 'x1', head_bn: 'চা-জলখাবার', amount: 120, mode: 'নগদ', note: '', photo_id: '' }

const ev = run(() => draft.newDraft('2026-10-19', ['p1', 'p2']))
const evRows = run(() => {
  ev.sites[0].att = { w1: full(700) }
  ev.sites[0].mats = [cement(true)]
  ev.sites[0].pct = 60
  ev.sites[1].att = { w2: full(700) }
  ev.sites[1].exps = [tea]
  ev.pexps = [{ key: 'o1', head_bn: 'বাজার', amount: 300, mode: 'নগদ', note: '', photo_id: '' }]
  ev.recv = [{ key: 'r1', project_id: 'p1', amount: 5000, mode: 'নগদ' }]
  return draft.buildEntries(ev)
})
const rowsOk = Array.isArray(evRows)
const find = (f) => (rowsOk ? evRows.find(f) : undefined)
ck('two jobs: one batch', rowsOk && new Set(evRows.map((e) => e.batch)).size, 1)
ck('two jobs: one moment for every row', rowsOk && new Set(evRows.map((e) => e.created_at)).size, 1)
ck("the first job's wage carries the first job", find((e) => e.kind === 'attendance' && e.worker_id === 'w1')?.project_id, 'p1')
ck("the second job's wage carries the second job", find((e) => e.kind === 'attendance' && e.worker_id === 'w2')?.project_id, 'p2')
ck("the cement is the first job's", find((e) => e.kind === 'stock')?.project_id, 'p1')
ck("the tea is the second job's", find((e) => e.kind === 'money' && e.head_bn === 'চা-জলখাবার')?.project_id, 'p2')
ck('own spending carries no job', find((e) => e.kind === 'money' && e.personal)?.project_id, '')
ck('money received keeps its own job', find((e) => e.kind === 'money' && e.dir === 'received')?.project_id, 'p1')
ck('one day row, with no job', rowsOk && evRows.filter((e) => e.kind === 'day').map((e) => '[' + e.project_id + ']').join(), '[]')
ck('a moved slider writes one slider row; an untouched one writes none', rowsOk && evRows.filter((e) => e.kind === 'progress' && e.state === 'pct').map((e) => e.project_id + ':' + e.pct).join(), 'p1:60')
/* The cash after it, by the book's own rule: 10,000 + 5,000 received in cash − 1,400 wages − 3,800 cement paid
   − 120 tea. The ₹300 of household spending is his own book's, not the business cash (only a drawing is). */
ck('cash after a two-job day matches the hand sum', run(() => draft.cashAfterDay([], ev, 10000, '2026-10-01')), 9680)

const sm = run(() => draft.newDraft('2026-10-19', ['']))
const smRows = run(() => { sm.sites[0].att = { w3: full(400) }; return draft.buildEntries(sm) })
ck("the shop's men are written with no job", Array.isArray(smRows) && smRows.filter((e) => e.kind === 'attendance').map((e) => '[' + e.project_id + ']').join(), '[]')

/* A day half-written by build 26: one job, its fields at the top of the draft. */
const old = {
  batch: 'bold', date: '2026-10-18', project_id: 'p1',
  att: { w1: full(700), w2: { presence: 'half', rate: 500, amount: 250, advance: 100 } },
  mats: [cement(false)], rets: [], exps: [tea], pexps: [], invs: [],
  recv: [{ key: 'r', project_id: 'p1', amount: 5000, mode: 'নগদ' }],
  progress: { stage_seq: 2, state: 'half' }, cash_counted: null, cash_computed: null, note: 'বৃষ্টি',
  step: 3, at: 'material', started_at: '2026-10-18T12:00:00Z', from_yesterday: false, att_seeded: true,
}
const nd = run(() => draft.normalizeDraft(structuredClone(old)))
ck('an old draft becomes one job', nd?.sites?.length, 1)
ck('…with its men', nd?.sites && Object.keys(nd.sites[0].att).sort().join(), 'w1,w2')
ck('…its cement and its tea', nd?.sites && nd.sites[0].mats.length + '+' + nd.sites[0].exps.length, '1+1')
ck('…and its note and money received', nd?.note + '/' + nd?.recv?.length, 'বৃষ্টি/1')
const sig = (rs) => rs.map((e) => [e.kind, e.project_id, e.amount ?? '', e.state ?? '', e.stage_seq ?? ''].join('/')).sort().join(' ')
const OLD_ROWS = ['attendance/p1/700//', 'attendance/p1/250//', 'stock/p1/3800//', 'money/p1/120//', 'money/p1/5000//', 'progress/p1//half/2', 'day////'].sort().join(' ')
ck('an old draft saves the rows build 26 saved (its day row now carries no job)', run(() => sig(draft.buildEntries(structuredClone(old)))), OLD_ROWS)

/* ---------- the order of the questions ---------- */

const keys = (o) => run(() => day.daySteps(o).map((s) => s.key).join(' '))
const one = { ...draft.newDraft('2026-10-19', ['p1']) }
if (one.sites) one.sites[0].att = { w1: full(700) }
ck('one job with men', keys({ draft: one, jobs: 1, hasMen: true, runsShop: true }),
  'pick men:0 wages:0 mat:0 exp:0 recv:0 pct:0 shop own cash review')
const nobody = draft.newDraft('2026-10-19', ['p1'])
ck('no men on the books: no men, no wages', keys({ draft: nobody, jobs: 1, hasMen: false, runsShop: true }),
  'pick mat:0 exp:0 recv:0 pct:0 shop own cash review')
ck('a job where nobody came has no wages question', keys({ draft: nobody, jobs: 1, hasMen: true, runsShop: true }),
  'pick men:0 mat:0 exp:0 recv:0 pct:0 shop own cash review')
const two = draft.newDraft('2026-10-19', ['p2', 'p1'])
ck('two jobs, in the order ticked', keys({ draft: two, jobs: 2, hasMen: true, runsShop: false }),
  'pick men:0 mat:0 exp:0 recv:0 pct:0 men:1 mat:1 exp:1 recv:1 pct:1 own cash review')
ck('no jobs and no shop men: no first question', keys({ draft: draft.newDraft('2026-10-19', []), jobs: 0, hasMen: true, runsShop: false }),
  'own cash review')
const shopOnly = draft.newDraft('2026-10-19', [''])
if (shopOnly.sites) shopOnly.sites[0].att = { w3: full(400) }
ck("the shop's men only", keys({ draft: shopOnly, jobs: 0, hasMen: true, runsShop: true }),
  'pick men:0 wages:0 shop own cash review')
const both = draft.newDraft('2026-10-19', ['p1', 'p2'])
if (both.sites) both.sites[0].att = { w1: full(700) }
ck('a man ticked at the first job is named at the second', run(() => [...day.menElsewhere(both, 1)].join()), 'w1')
ck('…and not at the first', run(() => [...day.menElsewhere(both, 0)].join()), '')

/* ---------- the price question names the thing in the possessive ---------- */

const { bn } = app
ck('a word ending in a consonant takes -ের', run(() => bn.ofBn('সিমেন্ট')), 'সিমেন্টের')
ck('a word ending in a vowel takes -র', run(() => bn.ofBn('বালি')), 'বালির')
ck('ং becomes ঙ before -ের', run(() => bn.ofBn('রং')), 'রঙের')
ck('a name ending in a sign keeps a hyphen', run(() => bn.ofBn('পাইপ ৩/৪"')), 'পাইপ ৩/৪"-এর')

/* ---------- a job set up half-way ---------- */

const { jobstart } = app
const js = run(() => jobstart.jobStartRows('p', 40, 30000, '2026-10-19'))
ck('a job set up at 40% writes one slider row of 40', Array.isArray(js) && js.filter((e) => e.kind === 'progress').map((e) => e.state + ':' + e.pct).join(), 'pct:40')
ck('…and what came in so far as one received row', Array.isArray(js) && js.filter((e) => e.kind === 'money').map((e) => e.dir + ':' + e.amount).join(), 'received:30000')
ck('a new job with nothing done and nothing paid writes nothing', run(() => jobstart.jobStartRows('p', 0, 0, '2026-10-19').length), 0)

/* ---------- kinds of work ---------- */

const { kinds } = app
const K = run(() => kinds.KINDS)
ck('five kinds of work', Array.isArray(K) && K.map((k) => k.key).join('|'), 'ঘর|রং|স্যানিটারি|মেরামত|অন্য কাজ')
ck("every kind's steps add up to 100", Array.isArray(K) && K.every((k) => k.stages.reduce((a, s) => a + s[1], 0) === 100), true)
ck('the house keeps its eight steps and their ids', run(() => [1, 2, 8].map((q) => kinds.kindStageId('ঘর', q)).join()), 'seed-stage-1,seed-stage-2,seed-stage-8')
const ids = run(() => K.flatMap((k) => k.stages.map((_, i) => kinds.kindStageId(k.key, i + 1))))
ck('no two seeded steps share an id', Array.isArray(ids) && new Set(ids).size === ids.length, true)
ck('a painting step has an id of its own', run(() => kinds.kindStageId('রং', 1)), 'seed-stage-paint-1')
ck('the house is called a new house', run(() => kinds.kindLabel('ঘর')), 'নতুন বাড়ি')
ck('painting is called painting work (রং alone means colour)', run(() => kinds.kindLabel('রং')), 'রঙের কাজ')
ck('a kind he made up shows as itself', run(() => kinds.kindLabel('ঢালাই')), 'ঢালাই')
ck('before anything is saved, a kind has its starting steps', run(() => kinds.kindStages([], 'স্যানিটারি').map((s) => s.seq + ':' + s.name_bn).join()), '1:পাইপের লাইন,2:প্যান-বেসিন ও ফিটিংস,3:জল দিয়ে পরীক্ষা,4:শেষ কাজ')
ck('once saved, his own steps are used', run(() => kinds.kindStages([{ id: 'x', kind: 'stage', project_type: 'রং', seq: 1, name_bn: 'চুনকাম', weight: 100, updated_at: '' }], 'রং').map((s) => s.name_bn).join()), 'চুনকাম')

console.log(`\n${pass} ok, ${fail} failed`)
if (fail) process.exit(1)
