import { useState } from 'react'
import { Chip, Sheet, MoneyPad } from '../ui/kit'
import { activeProjects, saveEntries, type State } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate, addDays, money } from '../lib/bn'
import { JOB_PAY_HEAD } from '../lib/calc'
import type { DraftRecv } from '../lib/draft'
import type { ID, MoneyEntry } from '../lib/model'
import { useOnce } from '../lib/once'
import { scheduleSync } from '../lib/sync'
import { t, tf } from '../lib/i18n'

/* Money coming in for a job — the first of the two things he most needs the
   book for. Three taps: which job, how much, cash or online. Online is stored
   as 'UPI' (the value the cash sum already ignores) and only shown in words. */

type Mode = DraftRecv['mode']
const MODES: { value: Mode; label: string }[] = [
  { value: 'নগদ', label: 'নগদ' },
  { value: 'UPI', label: 'অনলাইনে (UPI)' },
]

function ReceivedFields({ s, project, setProject, amount, setAmount, mode, setMode }: {
  s: State; project: ID | ''; setProject: (id: ID) => void
  amount: string; setAmount: (v: string) => void; mode: Mode; setMode: (m: Mode) => void
}) {
  return (
    <>
      <h2 className="question">{t('কোন কাজের টাকা?')}</h2>
      <div className="chips">
        {activeProjects(s).map((p) => <Chip key={p.id} on={project === p.id} onClick={() => setProject(p.id)}>{p.name_bn}</Chip>)}
      </div>
      <MoneyPad value={amount} onChange={setAmount} />
      <p className="sectionlabel">{t('কীভাবে পেলেন')}</p>
      <div className="chips">
        {MODES.map((m) => <Chip key={m.value} on={mode === m.value} onClick={() => setMode(m.value)}>{t(m.label)}</Chip>)}
      </div>
    </>
  )
}

const onlyJob = (s: State, preferred: ID | ''): ID | '' => {
  const act = activeProjects(s)
  if (preferred && act.some((p) => p.id === preferred)) return preferred
  return act.length === 1 ? act[0].id : ''
}

/** The evening's version: a whole screen inside the day, handing one line back to the draft. */
export function ReceivedForm({ s, defaultProject, onBack, onAdd }: {
  s: State; defaultProject: ID | ''; onBack: () => void; onAdd: (r: DraftRecv) => void
}) {
  const [project, setProject] = useState<ID | ''>(onlyJob(s, defaultProject))
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<Mode>('নগদ')
  return (
    <>
      <div className="scroll">
        <ReceivedFields s={s} project={project} setProject={setProject} amount={amount} setAmount={setAmount} mode={mode} setMode={setMode} />
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={onBack}>{t('ফিরে')}</button>
        <button className="btn primary" disabled={!Number(amount) || !project}
          onClick={() => onAdd({ key: uid(), project_id: project as ID, amount: Number(amount), mode })}>{t('যোগ করুন')}</button>
      </div>
    </>
  )
}

/** হিসাব → টাকা পেলাম: the same three taps on any day, written straight into the book. */
export function ReceivedSheet({ s, onClose, onDone }: { s: State; onClose: () => void; onDone: (msg: string) => void }) {
  const [project, setProject] = useState<ID | ''>(onlyJob(s, ''))
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<Mode>('নগদ')
  const [date, setDate] = useState(isoDate())
  const saveOnce = useOnce(async () => {
    const e: MoneyEntry = {
      id: uid(), kind: 'money', batch: uid(), date, project_id: project, created_at: new Date().toISOString(),
      head_bn: JOB_PAY_HEAD, dir: 'received', amount: Number(amount), party_id: '', mode, note: '', personal: false, photo_id: '',
    }
    await saveEntries([e])
    scheduleSync(300)
    const name = activeProjects(s).find((p) => p.id === project)?.name_bn || ''
    onDone(tf('{0} — {1} পাওয়া গেল', name, money(Number(amount))))
  })
  return (
    <Sheet title="টাকা পেলাম" onClose={onClose}>
      <ReceivedFields s={s} project={project} setProject={setProject} amount={amount} setAmount={setAmount} mode={mode} setMode={setMode} />
      <p className="sectionlabel">{t('কবে')}</p>
      <div className="chips">
        <Chip on={date === isoDate()} onClick={() => setDate(isoDate())}>{t('আজ')}</Chip>
        <Chip on={date === addDays(isoDate(), -1)} onClick={() => setDate(addDays(isoDate(), -1))}>{t('গতকাল')}</Chip>
      </div>
      <button className="btn primary" disabled={!Number(amount) || !project} onClick={saveOnce} style={{ marginTop: '.8rem', width: '100%' }}>
        {t('সেভ করুন')}
      </button>
    </Sheet>
  )
}
