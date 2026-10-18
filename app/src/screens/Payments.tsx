import { useState } from 'react'
import { useOnce } from '../lib/once'
import { Icon, Chip, Sheet, MoneyPad, Field } from '../ui/kit'
import { saveEntries, nameOf, type State } from '../lib/store'
import { uid } from '../lib/db'
import { money, isoDate, addDays } from '../lib/bn'
import { PAY_MODES, type ID, type MoneyEntry } from '../lib/model'
import { SETTLE_HEAD, modeLabel } from '../lib/calc'
import { scheduleSync } from '../lib/sync'
import { t, tf } from '../lib/i18n'

/* Paying off a bill, and collecting one.

   A due is never edited shut. The unpaid purchase stays exactly as it was
   written, and a payment is its own row against the same party; the balance
   is the difference. That is why the ledger can stay append-only and still
   answer "what do I owe Sharma Traders today".

   A settlement is not a new expense — the cement was counted the day it
   arrived — so it carries SETTLE_HEAD, which every cost total skips while the
   cash still moves. */

/** Open dues or receivables, one line per person: the total, the oldest date, since when, and whether it is all
    an old balance from the paper khata. */
export function byParty(rows: { party_id: ID; amount: number; due_date: string; date: string; dir?: string }[]) {
  // since: the day the oldest still-open row was written — what the reminder says the money is owed from.
  const map = new Map<ID, { party_id: ID; amount: number; oldest: string; since: string; old: boolean }>()
  for (const r of rows) {
    const cur = map.get(r.party_id)
    const fromPaper = !!r.dir && r.dir.startsWith('opening_')
    // oldest is '' when none of the party's bills has a date; those go last.
    if (cur) {
      cur.amount += r.amount
      if (r.due_date && (!cur.oldest || r.due_date < cur.oldest)) cur.oldest = r.due_date
      if (r.date < cur.since) cur.since = r.date
      cur.old = cur.old && fromPaper
    } else map.set(r.party_id, { party_id: r.party_id, amount: r.amount, oldest: r.due_date, since: r.date, old: fromPaper })
  }
  return [...map.values()].sort((a, b) => ((a.oldest || '9999') < (b.oldest || '9999') ? -1 : (a.oldest || '9999') > (b.oldest || '9999') ? 1 : 0))
}

/** টাকা দিলাম / টাকা পেলাম against one person's balance. */
export function SettleSheet({ s, party_id, dir, owed, onClose, onDone }: {
  s: State; party_id: ID; dir: 'paid' | 'received'; owed: number
  onClose: () => void; onDone: (msg: string) => void
}) {
  const [value, setValue] = useState(String(Math.round(owed)))
  const [mode, setMode] = useState(PAY_MODES[0])
  const [date, setDate] = useState(isoDate())
  const name = party_id ? nameOf(s, party_id) : dir === 'paid' ? t('নাম লেখা নেই') : t('খুচরো খদ্দের')
  const amount = Number(value) || 0

  const saveOnce = useOnce(() => save())
  const save = async () => {
    const e: MoneyEntry = {
      id: uid(), kind: 'money', batch: uid(), date, project_id: '',
      created_at: new Date().toISOString(),
      head_bn: SETTLE_HEAD, dir, amount, party_id, mode, note: '', personal: false, photo_id: '',
    }
    await saveEntries([e])
    scheduleSync(300)
    onDone(dir === 'paid' ? tf('{0} — {1} দেওয়া হল', name, money(amount)) : tf('{0} — {1} পাওয়া গেল', name, money(amount)))
  }

  return (
    <Sheet title={dir === 'paid' ? 'টাকা দিলাম' : 'টাকা পেলাম'} onClose={onClose}>
      <p className="small muted" style={{ marginBottom: '.6rem' }}>
        {dir === 'paid' ? tf('{0} — বাকি {1}', name, money(owed)) : tf('{0} — পাওনা {1}', name, money(owed))}
      </p>
      <MoneyPad value={value} onChange={setValue} chips={[Math.round(owed)]} />
      <Field label="কীভাবে">
        <div className="chips">{PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{modeLabel(m)}</Chip>)}</div>
      </Field>
      <Field label="কবেকার">
        <div className="chips">
          <Chip on={date === isoDate()} onClick={() => setDate(isoDate())}>{t('আজ')}</Chip>
          <Chip on={date === addDays(isoDate(), -1)} onClick={() => setDate(addDays(isoDate(), -1))}>{t('গতকাল')}</Chip>
        </div>
      </Field>
      {amount > owed + 0.5 && (
        <div className="alert warn" style={{ marginBottom: '.7rem' }}>
          <span className="dot" />
          <span>{t('বাকির চেয়ে বেশি লিখছেন। বাড়তি টাকাটা পরের বিলের জমা হিসেবে থেকে যাবে।')}</span>
        </div>
      )}
      <button className="btn primary" disabled={amount <= 0} onClick={saveOnce} style={{ marginTop: '.4rem', width: '100%' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
          <Icon name="check" size={18} />{t('খাতায় তুলুন')}
        </span>
      </button>
    </Sheet>
  )
}
