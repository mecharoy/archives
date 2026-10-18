import { useState } from 'react'
import { Icon, Field, NumField, Chip, Pick, CheckPick } from '../ui/kit'
import { saveMaster, saveSettings, useStore, allItems, activeProjects, stages } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate } from '../lib/bn'
import type { Worker } from '../lib/model'
import { seedKinds } from '../lib/seed'
import { kindLabel, kindStages } from '../lib/kinds'
import { currentStage } from '../lib/calc'
import { askNotify } from '../lib/remind'
import { t, tf, setLang, type Lang } from '../lib/i18n'
import { useBackHandler } from '../lib/back'
import { NewProjectSheet } from './NewJob'

/* First run, with the helper beside him. One plain question a screen, nothing he has to know first:
   his name; what he does (contracting, a shop, or both); the jobs running now, of any kind; the men he pays
   a daily wage; the cash in hand; and whether the phone may remind him — asked here, with the reason, so
   Android's own box makes sense when it comes. No key: the online book's key is pasted later, in Settings,
   by the helper. Every answer can be changed in Settings. */

type Step = 'welcome' | 'name' | 'work' | 'jobs' | 'men' | 'cash' | 'notify'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const s = useStore((x) => x)
  const [step, setStep] = useState<Step>('welcome')
  const [lang, setLangState] = useState<Lang>(s.settings.lang)
  const [owner, setOwner] = useState('')
  const [runsSites, setRunsSites] = useState(true)
  const [runsShop, setRunsShop] = useState(true)
  const [men, setMen] = useState<{ name: string; rate: number | null }[]>([{ name: '', rate: null }])
  const [cash, setCash] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const PREV: Record<Step, Step> = { welcome: 'welcome', name: 'welcome', work: 'name', jobs: 'work', men: runsSites ? 'jobs' : 'work', cash: 'men', notify: 'cash' }
  useBackHandler(() => setStep(PREV[step]), step !== 'welcome' && !adding)

  // The language takes effect the moment it is chosen: the rest of setup is the first proof of the switch.
  const chooseLang = (l: Lang) => { setLangState(l); setLang(l); void saveSettings({ lang: l }) }

  const start = async () => {
    // Every kind's steps, before a job is added: the new-job sheet names the step a job is at.
    await seedKinds(allItems(s), stages(s), 'missing')
    setStep('name')
  }

  const finish = async (remind: boolean) => {
    setBusy(true)
    if (remind) await askNotify()
    const now = new Date().toISOString()
    for (const m of men) {
      // The men step will not go on while a named man has no wage, so every man here has one.
      if (!m.name.trim()) continue
      await saveMaster({ id: uid(), kind: 'worker', name_bn: m.name.trim(), rate: m.rate ?? 0, phone: '', active: true, updated_at: now } as Worker)
    }
    await seedKinds(allItems(s))
    // Without a starting figure the first evening's cash comes out negative, which reads like an error.
    await saveSettings({ onboarded: true, opening_cash: cash ?? 0, opening_date: isoDate(), lang, owner_bn: owner.trim(), runs_shop: runsShop, runs_sites: runsSites })
    setBusy(false)
    onDone()
  }

  const back = <button className="btn ghost" onClick={() => setStep(PREV[step])}>{t('ফিরে')}</button>

  /* ---- 1. hello ---- */
  if (step === 'welcome') {
    return (
      <>
        <div className="scroll">
          <div style={{ padding: '3.5rem 0 1rem', color: 'var(--accent)' }}><Icon name="book" size={44} stroke={1.5} /></div>
          <h2 className="question" style={{ fontSize: '2rem' }}>{t('নমস্কার!')}</h2>
          <p className="hint" style={{ fontSize: '1.08rem', color: 'var(--ink-2)' }}>{t('এখানে রোজের কাজ, দোকান আর টাকার হিসাব থাকবে।')}</p>
          <button className="btn quiet small" style={{ marginTop: '2rem' }} onClick={() => chooseLang(lang === 'bn' ? 'en' : 'bn')}>
            {lang === 'bn' ? 'English' : 'বাংলা'}
          </button>
        </div>
        <div className="actionbar"><button className="btn primary" onClick={start}>{t('শুরু করি')}</button></div>
      </>
    )
  }

  /* ---- 2. his name ---- */
  if (step === 'name') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('আপনার নাম কী?')}</h2>
          <Field label="নাম"><input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} autoFocus /></Field>
        </div>
        <div className="actionbar">{back}<button className="btn primary" onClick={() => setStep('work')}>{t('এগিয়ে যান')}</button></div>
      </>
    )
  }

  /* ---- 3. what he does ---- */
  if (step === 'work') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('আপনি কী কী করেন?')}</h2>
          <div className="rowlist">
            <CheckPick on={runsSites} title="ঠিকাদারির কাজ" sub="বাড়ি, রং, স্যানিটারি, মেরামত" onClick={() => setRunsSites(!runsSites)} />
            <CheckPick on={runsShop} title="দোকান" sub="মাল কেনা-বেচা" onClick={() => setRunsShop(!runsShop)} />
          </div>
          {/* With neither, the app would open on two empty tabs. */}
          {!runsSites && !runsShop && <p className="small" style={{ marginTop: '.6rem', color: 'var(--warn)' }}>{t('একটা অন্তত বেছে নিন।')}</p>}
        </div>
        <div className="actionbar">{back}<button className="btn primary" disabled={!runsSites && !runsShop} onClick={() => setStep(runsSites ? 'jobs' : 'men')}>{t('এগিয়ে যান')}</button></div>
      </>
    )
  }

  /* ---- 4. the jobs running now ---- */
  if (step === 'jobs') {
    const jobs = activeProjects(s)
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('এখন কোন কোন কাজ চলছে?')}</h2>
          <div className="rowlist">
            {jobs.map((p) => {
              const st = currentStage(p, s.entries, stages(s)).current
              const steps = kindStages(stages(s), p.ptype)
              return <Pick key={p.id} title={p.name_bn} sub={t(kindLabel(p.ptype)) + (st && steps.length > 1 ? ' · ' + tf('{0} চলছে', t(st.name_bn)) : '')} />
            })}
            <Pick title="+ কাজ যোগ করুন" onClick={() => setAdding(true)} />
          </div>
        </div>
        <div className="actionbar">{back}<button className="btn primary" onClick={() => setStep('men')}>{jobs.length ? t('এগিয়ে যান') : t('এখন কোনো কাজ নেই')}</button></div>
        {adding && <NewProjectSheet onClose={() => setAdding(false)} onCreated={() => setAdding(false)} />}
      </>
    )
  }

  /* ---- 5. the men ---- */
  /* A man is written with his day's wage or not at all: a wage of 0 makes every day he works cost nothing. */
  const menMissingWage = men.some((m) => m.name.trim() && !(m.rate && m.rate > 0))
  if (step === 'men') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('কাদের মজুরি দেন?')}</h2>
          <p className="hint">{t('নাম আর এক দিনের মজুরি। বাকিরা পরে।')}</p>
          {men.map((m, k) => (
            <div key={k} style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
              <input className="input" style={{ flex: 2 }} placeholder={t('নাম')} value={m.name}
                onChange={(e) => setMen(men.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
              <div style={{ flex: 1 }}>
                <NumField value={m.rate} placeholder="দিনে ₹" onChange={(v) => setMen(men.map((x, j) => (j === k ? { ...x, rate: v } : x)))} />
              </div>
            </div>
          ))}
          <div className="chips"><Chip onClick={() => setMen([...men, { name: '', rate: null }])}>+ আরও একজন</Chip></div>
          {menMissingWage && <p className="small" style={{ marginTop: '.6rem', color: 'var(--warn)' }}>{t('মজুরি না দিলে হিসাব ভুল হবে।')}</p>}
        </div>
        <div className="actionbar">{back}<button className="btn primary" disabled={menMissingWage} onClick={() => setStep('cash')}>{t('এগিয়ে যান')}</button></div>
      </>
    )
  }

  /* ---- 6. cash in hand ---- */
  if (step === 'cash') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('এখন হাতে কত টাকা আছে?')}</h2>
          <p className="hint">{t('না জানলে ছেড়ে দিন।')}</p>
          <Field label="হাতে টাকা"><NumField value={cash} onChange={setCash} /></Field>
        </div>
        <div className="actionbar">{back}<button className="btn primary" onClick={() => setStep('notify')}>{t('এগিয়ে যান')}</button></div>
      </>
    )
  }

  /* ---- 7. may the phone remind him ---- */
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('ফোনে মনে করিয়ে দেওয়া চালু করবেন?')}</h2>
        <div className="card">
          <div className="review-row"><span><span className="t">{t('সকাল ৮টা')}</span><span className="k">{t('আজকের কথা')}</span></span></div>
          <div className="review-row"><span><span className="t">{t('রাত ৮টা')}</span><span className="k">{t('হিসাব লেখা না হলে')}</span></span></div>
          <div className="review-row"><span><span className="t">{t('সোমবার সকাল')}</span><span className="k">{t('কে কত টাকা দেবে')}</span></span></div>
          <div className="review-row"><span><span className="t">{t('বাকির তারিখে')}</span><span className="k">{t('কাকে দিতে হবে, কে দেবে')}</span></span></div>
        </div>
      </div>
      <div className="actionbar">
        <button className="btn ghost" disabled={busy} onClick={() => void finish(false)}>{t('এখন না')}</button>
        <button className="btn primary" disabled={busy} onClick={() => void finish(true)}>{busy ? t('তোলা হচ্ছে…') : t('হ্যাঁ, চালু করুন')}</button>
      </div>
    </>
  )
}
