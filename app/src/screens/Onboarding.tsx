import { useState } from 'react'
import { Icon, Field, NumField, Chip } from '../ui/kit'
import { saveMaster, saveSettings, useStore, allItems } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate, money } from '../lib/bn'
import type { Project, Worker } from '../lib/model'
import { seedHouse, HOUSE } from '../lib/seed'

/* Three screens, then he is entering. Nothing here can be got wrong in a way
   that matters — every field is editable later, and the app works with only
   the first one filled. */

export function Onboarding({ onDone }: { onDone: () => void }) {
  const s = useStore((x) => x)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState<number | null>(null)
  const [men, setMen] = useState<{ name: string; rate: number | null }[]>([{ name: '', rate: null }])
  const [cash, setCash] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

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
    await saveSettings({ onboarded: true, opening_cash: cash ?? 0, opening_date: isoDate() })
    setBusy(false)
    onDone()
  }

  if (step === 0) {
    return (
      <>
        <div className="scroll">
          <div style={{ padding: '3.5rem 0 1rem', color: 'var(--accent)' }}><Icon name="book" size={40} stroke={1.5} /></div>
          <h2 className="question">খাতাটা এবার ফোনে</h2>
          <p className="hint">
            রোজ সন্ধেবেলা কয়েকটা প্রশ্নের উত্তর দিলেই দিনের হিসাব লেখা হয়ে যাবে। যত ব্যবহার করবেন, তত কম টিপতে হবে —
            অ্যাপ আপনার নিজের অভ্যাস দেখে আগেভাগে ভরে দেবে।
          </p>
          <div className="card">
            <p className="small muted">তিনটে জিনিস এখন বসিয়ে নিই — পরে যখন খুশি বদলানো যাবে।</p>
          </div>
        </div>
        <div className="actionbar"><button className="btn primary" onClick={() => setStep(1)}>শুরু করি</button></div>
      </>
    )
  }

  if (step === 1) {
    return (
      <>
        <div className="scroll">
          <h2 className="question">এখন কোন কাজটা চলছে?</h2>
          <p className="hint">একটা নাম দিলেই হবে — যেমন ‘রামপুর বাড়ি’।</p>
          <Field label="কাজের নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="চুক্তির টাকা (জানা থাকলে)"><NumField value={budget} onChange={setBudget} /></Field>
          {budget ? <p className="small muted">{money(budget)} — এটা থাকলে খরচ আর কাজের তুলনা দেখানো যায়।</p> : null}
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep(0)}>ফিরে</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => setStep(2)}>এগিয়ে যান</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">কারা কাজ করে?</h2>
        <p className="hint">নাম আর রোজ। যতজন মনে আছে দিন, বাকিরা পরে যোগ হবে।</p>
        {men.map((m, k) => (
          <div key={k} style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
            <input className="input" style={{ flex: 2 }} placeholder="নাম" value={m.name}
              onChange={(e) => setMen(men.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
            <div style={{ flex: 1 }}>
              <NumField value={m.rate} placeholder="রোজ" onChange={(v) => setMen(men.map((x, j) => (j === k ? { ...x, rate: v } : x)))} />
            </div>
          </div>
        ))}
        <div className="chips">
          <Chip onClick={() => setMen([...men, { name: '', rate: null }])}>+ আরও একজন</Chip>
        </div>
        <div className="divider" />
        <Field label="এই মুহূর্তে হাতে কত টাকা আছে? (না জানলে ছেড়ে দিন)">
          <NumField value={cash} onChange={setCash} />
        </Field>
        <p className="small muted">এটা একবার বসালে রোজকার শেষে ‘হাতে কত’ নিজে থেকেই মিলে যাবে।</p>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={() => setStep(1)}>ফিরে</button>
        <button className="btn primary" disabled={busy} onClick={finish}>{busy ? 'সেভ হচ্ছে…' : 'হয়ে গেল'}</button>
      </div>
    </>
  )
}
