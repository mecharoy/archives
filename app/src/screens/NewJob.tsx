import { useState } from 'react'
import { Chip, Sheet, MoneyPad, Field, NumField } from '../ui/kit'
import { saveMaster, saveEntries, stages as allStages, getState } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate } from '../lib/bn'
import { HOUSE, HOUSE_STAGES } from '../lib/seed'
import { jobStartRows } from '../lib/jobstart'
import { scheduleSync } from '../lib/sync'
import type { Project } from '../lib/model'
import { t } from '../lib/i18n'

/* A job's starting stages: the house stages he has (seeded, maybe edited), or — on first setup, before
   anything is seeded — the same list the seed will write, with the same numbers. */
export function houseStages(): { seq: number; name_bn: string }[] {
  const mine = allStages(getState()).filter((s) => s.project_type === HOUSE).sort((a, b) => a.seq - b.seq)
  return mine.length ? mine : HOUSE_STAGES
}

/** এখন কোন ধাপে? and এ পর্যন্ত কত পেয়েছেন? — the two things that make a half-built job's card right. */
export function JobStartFields({ stageSeq, setStageSeq, received, setReceived }: {
  stageSeq: number | null; setStageSeq: (n: number) => void; received: number | null; setReceived: (n: number | null) => void
}) {
  const list = houseStages()
  return (
    <>
      <p className="sectionlabel">{t('এখন কোন ধাপে?')}</p>
      <div className="chips">
        {list.map((st) => <Chip key={st.seq} on={stageSeq === st.seq} onClick={() => setStageSeq(st.seq)}>{t(st.name_bn)}</Chip>)}
      </div>
      <p className="small muted" style={{ marginTop: '.3rem' }}>{t('এর আগের ধাপগুলো শেষ বলে ধরা হবে।')}</p>
      <Field label="এ পর্যন্ত কত পেয়েছেন? (ইচ্ছে হলে)"><NumField value={received} onChange={setReceived} /></Field>
    </>
  )
}

/* A job started from inside the day's entry or from কাজ → কাজ যোগ করা: the contract arrives on a
   Tuesday, not on the day he set the app up. It asks the three things the job card is built from —
   what was agreed, where the work is now, and what has come in so far. Size and plan days stay in
   সেটিংস → কাজ, editable later. */
export function NewProjectSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [contract, setContract] = useState('')
  const [stageSeq, setStageSeq] = useState<number | null>(houseStages()[0]?.seq ?? null)
  const [received, setReceived] = useState<number | null>(null)
  const create = async () => {
    const p: Project = {
      id: uid(), kind: 'project', name_bn: name.trim(), client_bn: client.trim(), ptype: HOUSE,
      area_sqft: null, budget: Number(contract) || null, start_date: isoDate(), plan_days: null, status: 'active',
      updated_at: new Date().toISOString(),
    }
    await saveMaster(p)
    const rows = jobStartRows(p.id, houseStages(), stageSeq, received ?? 0)
    if (rows.length) { await saveEntries(rows); scheduleSync(300) }
    onCreated(p)
  }
  return (
    <Sheet title="নতুন কাজ" onClose={onClose}>
      <Field label="কাজের নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন — রামপুর বাড়ি" autoFocus /></Field>
      <Field label="কার কাজ (ইচ্ছে হলে)"><input className="input" value={client} onChange={(e) => setClient(e.target.value)} /></Field>
      <p className="sectionlabel">{t('চুক্তির টাকা')}</p>
      <MoneyPad value={contract} onChange={setContract} />
      <JobStartFields stageSeq={stageSeq} setStageSeq={setStageSeq} received={received} setReceived={setReceived} />
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem', width: '100%' }}>{t('যোগ করুন')}</button>
    </Sheet>
  )
}
