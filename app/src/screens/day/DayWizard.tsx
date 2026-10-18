import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../ui/kit'
import { useStore, getState, activeProjects, workers, allWorkers, items, saveEntries, saveMaster } from '../../lib/store'
import { isoDate, dayLabelBn, toBn } from '../../lib/bn'
import { newDraft, normalizeDraft, loadDraft, saveDraft, clearDraft, buildEntries, cashAfterDay, draftIsEmpty, type Draft, type DraftSite } from '../../lib/draft'
import { daySteps, type DayStep } from '../../lib/day'
import { maybeMakeBrief } from '../../lib/aiBrief'
import { scheduleSync } from '../../lib/sync'
import { useBackHandler } from '../../lib/back'
import { t } from '../../lib/i18n'
import { siteName } from './common'
import { StepPick } from './StepPick'
import { StepMen, StepWages } from './StepMen'
import { StepMaterial } from './StepMaterial'
import { StepExpense } from './StepExpense'
import { StepReceived } from './StepReceived'
import { StepProgress } from './StepProgress'
import { StepCash } from './StepCash'
import { StepReview } from './StepReview'

/* Today's entry, job by job.

   The order of the questions is day.ts's, worked out afresh from the draft on every change: tick a second
   job and its questions appear after the first's; tick nobody at a job and its wages question is gone. The
   step he is on is remembered by its key, so a draft he left opens where he was. A jump from the review
   comes back to the review — after who-came, by way of their wages, which are one thing with it. */

/* A draft as it is opened: men no longer on the books are let go (a draft can outlive a man), and on a fresh
   day with exactly one running job, that job is already ticked. */
function prepare(d: Draft): Draft {
  const s = getState()
  const known = new Set(allWorkers(s).map((w) => w.id))
  const sites: DraftSite[] = d.sites.map((x) => ({ ...x, att: Object.fromEntries(Object.entries(x.att).filter(([w]) => known.has(w))) }))
  const act = activeProjects(s)
  if (!d.picked && !sites.length && act.length === 1) sites.push({ project_id: act[0].id, att: {}, mats: [], rets: [], exps: [], pct: null })
  return { ...d, sites }
}

export function DayWizard({ start, onExit }: { start: Draft | null; onExit: (saved: boolean, date?: string) => void }) {
  const s = useStore((x) => x)
  const [draft, setDraft] = useState<Draft | null>(() => (start ? prepare(normalizeDraft(start)) : null))
  const [cur, setCur] = useState<string | null>(() => start?.at ?? null)
  const [returnTo, setReturnTo] = useState<string | null>(null)

  useEffect(() => {
    if (draft) return
    void (async () => {
      // A half-finished day is resumed whatever date it carries: he may be finishing yesterday's this morning.
      const raw = await loadDraft()
      const saved = raw ? normalizeDraft(raw) : null
      const resume = saved && (saved.date === isoDate() || !draftIsEmpty(saved))
      const d = prepare(resume && saved ? saved : newDraft())
      setDraft(d)
      setCur(resume && saved ? saved.at ?? null : null)
    })()
  }, [draft])

  const patch = (p: Partial<Draft>) => setDraft((d) => {
    if (!d) return d
    const next = { ...d, ...p }
    void saveDraft(next)
    return next
  })
  const patchSite = (i: number, p: Partial<DraftSite>) => setDraft((d) => {
    if (!d) return d
    const next = { ...d, sites: d.sites.map((x, k) => (k === i ? { ...x, ...p } : x)) }
    void saveDraft(next)
    return next
  })

  const steps: DayStep[] = useMemo(() => (draft
    ? daySteps({ draft, jobs: activeProjects(s).length, hasMen: workers(s).length > 0, runsShop: s.settings.runs_shop })
    : []), [draft, s])
  /* The step he left off at — unless a who-came question he has never seen now comes before it (a man was put
     on the books since): that question first, or tonight's men would go unwritten. */
  const left = steps.find((x) => x.key === cur) ?? steps[0]
  const unseen = draft && left ? steps.find((x, i) => i < steps.indexOf(left) && x.kind === 'men' && !draft.sites[x.site!]?.att_seeded) : undefined
  const step = unseen ?? left
  const at = step ? steps.indexOf(step) : 0
  // Made the current step for real: that screen marks itself seen as it opens, and must not then vanish.
  useEffect(() => { if (unseen && cur !== unseen.key) setCur(unseen.key) }, [unseen?.key]) // eslint-disable-line
  const go = (key: string) => setCur(key)
  const next = () => {
    const nx = steps[at + 1]
    // Who came and what they were paid are one thing: a change of men walks on to their wages first.
    const pairs = step?.kind === 'men' && nx?.kind === 'wages' && nx.site === step.site
    if (returnTo && !pairs) { const r = returnTo; setReturnTo(null); go(r) }
    else if (nx) go(nx.key)
  }
  // Back is one step, not out of the whole day; after a jump from the review it is back to the review.
  const back = () => {
    if (returnTo) { const r = returnTo; setReturnTo(null); go(r); return }
    if (at > 0) go(steps[at - 1].key); else onExit(false)
  }
  useBackHandler(back)
  const jump = (key: string) => { setReturnTo('review'); go(key) }

  /* Only a step he actually moved to is remembered, by its key. */
  useEffect(() => { if (draft && cur && steps.some((x) => x.key === cur) && draft.at !== cur) patch({ at: cur }) }, [cur, !!draft]) // eslint-disable-line

  if (!draft || !step) return null

  const save = async () => {
    // What the book expected to find AFTER this day's own spending — the figure the count is compared with.
    const withComputed = { ...draft, cash_computed: cashAfterDay(s.entries, draft, s.settings.opening_cash, s.settings.opening_date) }
    await saveEntries(buildEntries(withComputed))
    // Keep each item's rate current, so the estimator and the shop see the price he just paid.
    for (const m of [...draft.sites.flatMap((x) => x.mats), ...draft.invs]) {
      const it = items(s).find((x) => x.id === m.item_id)
      if (it && m.rate > 0 && it.last_rate !== m.rate) await saveMaster({ ...it, last_rate: m.rate })
    }
    await clearDraft(draft.date)
    scheduleSync(300)
    // The evening is written: if it is after six, this is when the phone's brief is due (see briefDue.ts).
    void maybeMakeBrief()
    onExit(true, draft.date)
  }

  /* The coloured tag on top: which job (and which of how many), or which part of the day. */
  const sd = step.site != null ? draft.sites[step.site] : null
  const jobsTicked = draft.sites.filter((x) => x.project_id).length
  const [label, tone] = sd
    ? [siteName(s, sd) + (sd.project_id && jobsTicked > 1 ? ` · ${toBnIndex(draft, step.site!)}/${toBn(jobsTicked)}` : ''), sd.project_id ? '' : 'stock']
    : step.kind === 'shop' ? [t('দোকান'), 'stock']
      : step.kind === 'own' ? [t('নিজের'), 'plain']
        : step.kind === 'cash' ? [t('হাতের টাকা'), 'money']
          : step.kind === 'review' ? [t('শেষে'), 'done']
            : [t('আজকের হিসাব'), 'done']
  const site = step.site ?? 0
  const siteProps = { s, draft, patch, next, site, patchSite }

  return (
    <>
      <div className="wizhead">
        <button className="iconbtn" onClick={back} aria-label={t('আগের ধাপ')}><Icon name="back" /></button>
        <div className="wizmid">
          <span className={'sec ' + tone}>{label}</span>
          <div className="wizbar"><i style={{ width: `${Math.round(((at + 1) / steps.length) * 100)}%` }} /></div>
        </div>
        {draft.date !== isoDate() && <span className="stepcount">{dayLabelBn(draft.date)}</span>}
        <button className="iconbtn" onClick={() => onExit(false)} aria-label={t('বন্ধ করুন')}><Icon name="close" /></button>
      </div>

      {step.kind === 'pick' && <StepPick s={s} draft={draft} patch={patch} next={next} />}
      {step.kind === 'men' && <StepMen key={step.key} {...siteProps} />}
      {step.kind === 'wages' && <StepWages key={step.key} {...siteProps} />}
      {step.kind === 'mat' && sd && (
        <StepMaterial key={step.key} s={s} date={draft.date} rankFor={sd.project_id} question="মাল এল?" next={next}
          list={sd.mats} setList={(mats) => patchSite(site, { mats })} rets={sd.rets} setRets={(rets) => patchSite(site, { rets })} />
      )}
      {step.kind === 'exp' && sd && (
        <StepExpense key={step.key} s={s} list={sd.exps} setList={(exps) => patchSite(site, { exps })} next={next}
          question="আর কোনো খরচ?" hint="গাড়ি ভাড়া, মেশিন, চা-জল — মজুরি আর মাল বাদে।" />
      )}
      {step.kind === 'recv' && <StepReceived key={step.key} {...siteProps} />}
      {step.kind === 'pct' && <StepProgress key={step.key} {...siteProps} />}
      {step.kind === 'shop' && (
        <StepMaterial key="shop" s={s} date={draft.date} rankFor="" question="দোকানের জন্য মাল কিনলেন?" next={next}
          list={draft.invs} setList={(invs) => patch({ invs })} />
      )}
      {step.kind === 'own' && (
        <StepExpense key="own" s={s} list={draft.pexps} setList={(pexps) => patch({ pexps })} personal next={next}
          question="নিজের বা সংসারের কোনো খরচ?" hint="এটা কাজের খরচে ধরা হবে না।" />
      )}
      {step.kind === 'cash' && <StepCash s={s} draft={draft} patch={patch} next={next} />}
      {step.kind === 'review' && <StepReview s={s} draft={draft} patch={patch} jump={jump} onSave={save} />}
    </>
  )
}

/* Which job of tonight's this is, counting jobs only (the shop's men are not a job). */
function toBnIndex(d: Draft, site: number): string {
  return toBn(d.sites.slice(0, site + 1).filter((x) => x.project_id).length)
}
