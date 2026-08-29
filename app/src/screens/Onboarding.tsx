import { useState } from 'react'
import { Icon, Field, NumField, Chip, Pick } from '../ui/kit'
import { saveMaster, saveSettings, useStore, allItems } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate, money } from '../lib/bn'
import type { Project, Worker } from '../lib/model'
import { seedHouse, HOUSE } from '../lib/seed'
import { t, setLang, type Lang } from '../lib/i18n'

/* First run.

   It opens by saying what the app is for and what it will never do, then asks
   who he is and what he actually runs — a shop, sites, or both — because that
   decides which of the three books he lands in every evening. Only after that
   does it ask for anything to fill in, and every one of those is skippable:
   a man with no contract this month must still be able to finish setup, and
   an invented job name would quietly poison every per-job total afterwards.

   Nothing here is permanent. All of it is editable in সেটিংস. */

type Step = 'intro' | 'lang' | 'about' | 'work' | 'people' | 'cash'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const s = useStore((x) => x)
  const [step, setStep] = useState<Step>('intro')
  const [lang, setLangState] = useState<Lang>('bn')
  const [owner, setOwner] = useState('')
  const [runsShop, setRunsShop] = useState(true)
  const [runsSites, setRunsSites] = useState(true)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState<number | null>(null)
  const [men, setMen] = useState<{ name: string; rate: number | null }[]>([{ name: '', rate: null }])
  const [cash, setCash] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // The language has to take effect the moment he picks it, not at the end —
  // the rest of setup is the first proof that the switch does anything.
  const chooseLang = (l: Lang) => { setLangState(l); setLang(l); void saveSettings({ lang: l }) }

  const finish = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    if (name.trim()) {
      await saveMaster({
        id: uid(), kind: 'project', name_bn: name.trim(), client_bn: '', ptype: HOUSE,
        area_sqft: null, budget, start_date: isoDate(), plan_days: null, status: 'active', updated_at: now,
      } as Project)
    }
    for (const m of men) {
      if (!m.name.trim() || !m.rate) continue
      await saveMaster({ id: uid(), kind: 'worker', name_bn: m.name.trim(), rate: m.rate, phone: '', active: true, updated_at: now } as Worker)
    }
    await seedHouse(allItems(s))
    // Without a starting figure the first day's closing cash comes out
    // negative, which reads like an error on the very first screen he sees.
    await saveSettings({
      onboarded: true, opening_cash: cash ?? 0, opening_date: isoDate(),
      lang, owner_bn: owner.trim(), runs_shop: runsShop, runs_sites: runsSites,
    })
    setBusy(false)
    onDone()
  }

  /* ---- 1. what this is ---- */
  if (step === 'intro') {
    return (
      <>
        <div className="scroll">
          <div style={{ padding: '3.5rem 0 1rem', color: 'var(--accent)' }}><Icon name="book" size={40} stroke={1.5} /></div>
          <h2 className="question">{t('খাতাটা এবার ফোনে')}</h2>
          <p className="hint">
            {t('রোজ সন্ধেবেলা কয়েকটা প্রশ্নের উত্তর দিলেই দিনের হিসাব লেখা হয়ে যাবে। যত ব্যবহার করবেন, তত কম টিপতে হবে — অ্যাপ আপনার নিজের অভ্যাস দেখে আগেভাগে ভরে দেবে।')}
          </p>
          <div className="card">
            <div className="review-row">
              <span><span className="t">{t('কাজ')}</span><span className="k">{t('সাইটের লোক, মাল, খরচ আর অগ্রগতি')}</span></span>
            </div>
            <div className="review-row">
              <span><span className="t">{t('মজুত')}</span><span className="k">{t('দোকানে কী ঢুকল, কী বিক্রি হল, কী পড়ে আছে')}</span></span>
            </div>
            <div className="review-row">
              <span><span className="t">{t('হিসাব')}</span><span className="k">{t('হাতে কত, কাকে কত দিতে হবে, মাসে কত গেল')}</span></span>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: '.8rem' }}>
            {t('নেট না থাকলেও পুরোটা চলে। কোনো নাম-পাসওয়ার্ড লাগে না। কোনো হিসাব মুছে যায় না — ভুল হলে উল্টো লাইন লেখা হয়।')}
          </p>
        </div>
        <div className="actionbar"><button className="btn primary" onClick={() => setStep('lang')}>{t('শুরু করি')}</button></div>
      </>
    )
  }

  /* ---- 2. language ---- */
  if (step === 'lang') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('কোন ভাষায় দেখতে চান?')}</h2>
          <p className="hint">{t('পরে যখন খুশি বদলানো যাবে — সেটিংস থেকে।')}</p>
          <div className="rowlist">
            <Pick on={lang === 'bn'} title="বাংলা" sub="সংখ্যাও বাংলায় — ১,২৫০" onClick={() => chooseLang('bn')} />
            <Pick on={lang === 'en'} title="English" sub="Same app, English words — 1,250" onClick={() => chooseLang('en')} />
          </div>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('intro')}>{t('ফিরে')}</button>
          <button className="btn primary" onClick={() => setStep('about')}>{t('এগিয়ে যান')}</button>
        </div>
      </>
    )
  }

  /* ---- 3. who he is, and what he runs ---- */
  if (step === 'about') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('আপনার নাম?')}</h2>
          <p className="hint">{t('শুধু ডাকার জন্য — খাতার উপরে দেখাবে।')}</p>
          <Field label="নাম"><input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} autoFocus /></Field>

          <div className="divider" />
          <h2 className="question" style={{ marginTop: 0 }}>{t('কী কী চালান?')}</h2>
          <p className="hint">{t('যেটা চালান না, সেটাও থাকবে — শুধু পরে দেখাবে।')}</p>
          <div className="rowlist">
            <Pick on={runsSites} title="সাইটের কাজ" sub="ঠিকাদারি, বাড়ি তোলা" onClick={() => setRunsSites(!runsSites)} />
            <Pick on={runsShop} title="দোকান" sub="মাল কেনা-বেচা, মজুত" onClick={() => setRunsShop(!runsShop)} />
          </div>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('lang')}>{t('ফিরে')}</button>
          <button className="btn primary" onClick={() => setStep(runsSites ? 'work' : 'cash')}>{t('এগিয়ে যান')}</button>
        </div>
      </>
    )
  }

  /* ---- 4. a job, if there is one ---- */
  if (step === 'work') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('এখন কোন কাজটা চলছে?')}</h2>
          <p className="hint">{t('একটা নাম দিলেই হবে — যেমন ‘রামপুর বাড়ি’। এখন কোনো কাজ না থাকলে ছেড়ে দিন, পরে যোগ করা যাবে।')}</p>
          <Field label="কাজের নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="চুক্তির টাকা (জানা থাকলে)"><NumField value={budget} onChange={setBudget} /></Field>
          {budget ? <p className="small muted">{money(budget)} — {t('এটা থাকলে খরচ আর কাজের তুলনা দেখানো যায়।')}</p> : null}
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('about')}>{t('ফিরে')}</button>
          <button className="btn primary" onClick={() => setStep('people')}>{name.trim() ? t('এগিয়ে যান') : t('এখন কোনো কাজ নেই')}</button>
        </div>
      </>
    )
  }

  /* ---- 5. the men ---- */
  if (step === 'people') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('কারা কাজ করে?')}</h2>
          <p className="hint">{t('নাম, আর একদিন কাজ করলে কত টাকা পায়। যতজন মনে আছে দিন, বাকিরা পরে যোগ হবে।')}</p>
          {men.map((m, k) => (
            <div key={k} style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
              <input className="input" style={{ flex: 2 }} placeholder={t('নাম')} value={m.name}
                onChange={(e) => setMen(men.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
              <div style={{ flex: 1 }}>
                <NumField value={m.rate} placeholder="দিনে ₹" onChange={(v) => setMen(men.map((x, j) => (j === k ? { ...x, rate: v } : x)))} />
              </div>
            </div>
          ))}
          <div className="chips">
            <Chip onClick={() => setMen([...men, { name: '', rate: null }])}>+ আরও একজন</Chip>
          </div>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('work')}>{t('ফিরে')}</button>
          <button className="btn primary" onClick={() => setStep('cash')}>{t('এগিয়ে যান')}</button>
        </div>
      </>
    )
  }

  /* ---- 6. cash in hand ---- */
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('এই মুহূর্তে হাতে কত টাকা আছে?')}</h2>
        <p className="hint">{t('না জানলে ছেড়ে দিন — যেদিন গুনবেন, সেদিন থেকেই মিলতে শুরু করবে।')}</p>
        <Field label="হাতে টাকা"><NumField value={cash} onChange={setCash} /></Field>
        <p className="small muted">{t('এটা একবার বসালে রোজকার শেষে ‘হাতে কত’ নিজে থেকেই মিলে যাবে।')}</p>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={() => setStep(runsSites ? 'people' : 'about')}>{t('ফিরে')}</button>
        <button className="btn primary" disabled={busy} onClick={finish}>{busy ? t('সেভ হচ্ছে…') : t('হয়ে গেল')}</button>
      </div>
    </>
  )
}
