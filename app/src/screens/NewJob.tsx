import { useState } from 'react'
import { Chip, Sheet, Field, NumField } from '../ui/kit'
import { saveMaster, saveEntries, stages as allStages, getState } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate, toBn } from '../lib/bn'
import { HOUSE, KINDS, kindStages } from '../lib/kinds'
import { stageAtPct } from '../lib/calc'
import { jobStartRows } from '../lib/jobstart'
import { scheduleSync } from '../lib/sync'
import type { Project } from '../lib/model'
import { t, tf } from '../lib/i18n'

/* A new job — from setup, from the কাজ tab, or from today's entry. What it is called, what kind of work it is
   (a job is not always a house), what was agreed, what came in so far, and how much is already done on the
   same slider the evenings use. That is what the job card is built from; size and plan days are changed later
   from the card. */
export function NewProjectSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState(HOUSE)
  const [contract, setContract] = useState<number | null>(null)
  const [received, setReceived] = useState<number | null>(null)
  const [pct, setPct] = useState(0)
  const steps = kindStages(allStages(getState()), kind)
  const at = steps.length > 1 ? (pct >= 100 ? t('কাজ শেষ') : tf('এখন চলছে: {0}', t(stageAtPct(steps, pct)?.name_bn || ''))) : ''

  const create = async () => {
    const p: Project = {
      id: uid(), kind: 'project', name_bn: name.trim(), client_bn: '', ptype: kind,
      area_sqft: null, budget: contract && contract > 0 ? contract : null, start_date: isoDate(), plan_days: null, status: 'active',
      updated_at: new Date().toISOString(),
    }
    await saveMaster(p)
    const rows = jobStartRows(p.id, pct, received ?? 0)
    if (rows.length) { await saveEntries(rows); scheduleSync(300) }
    onCreated(p)
  }

  return (
    <Sheet title="নতুন কাজ" onClose={onClose}>
      <Field label="কাজের নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('যেমন — রামপুরের বাড়ির রং')} autoFocus /></Field>
      <Field label="কী কাজ?">
        <div className="chips">
          {KINDS.map((k) => <Chip key={k.key} on={kind === k.key} onClick={() => setKind(k.key)}>{t(k.label_bn)}</Chip>)}
        </div>
      </Field>
      <Field label="চুক্তি কত টাকার? (জানা থাকলে)"><NumField value={contract} onChange={setContract} /></Field>
      <Field label="এ পর্যন্ত কত পেয়েছেন? (জানা থাকলে)"><NumField value={received} onChange={setReceived} /></Field>
      <Field label="কাজ কতটা হয়েছে?">
        <input type="range" className="slider" min={0} max={100} step={5} value={pct} aria-label={t('কাজ কতটা হয়েছে?')}
          onChange={(e) => setPct(Number(e.target.value))} style={{ ['--fill' as string]: pct + '%' }} />
        <p className="small muted" style={{ marginTop: '.2rem' }}>{toBn(pct)}%{at ? ' · ' + at : ''}</p>
      </Field>
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem', width: '100%' }}>{t('কাজটা যোগ করুন')}</button>
    </Sheet>
  )
}
