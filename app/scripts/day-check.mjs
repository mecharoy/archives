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

console.log(`\n${pass} ok, ${fail} failed`)
if (fail) process.exit(1)
