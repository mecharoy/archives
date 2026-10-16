import { useState } from 'react'
import { Chip, Sheet, MoneyPad, Field } from '../ui/kit'
import { DueChips } from '../ui/DueChips'
import { ContactPicker } from './Settings'
import { parties, saveEntries, saveMaster, type State } from '../lib/store'
import { uid } from '../lib/db'
import { isoDate, money } from '../lib/bn'
import { OPENING_GET, OPENING_OWE } from '../lib/calc'
import { defaultDueDays, dueFrom } from '../lib/dues'
import type { ID, Party, StockEntry } from '../lib/model'
import { useOnce } from '../lib/once'
import { scheduleSync } from '../lib/sync'
import { t, tf } from '../lib/i18n'

/* পুরোনো বাকি — the paper khata, copied in.

   Everything he was owed, and everything he owed, before the app existed. The
   helper does this with him at setup, one line of the old book at a time:
   who, which way, how much, since when, and when it is due. It becomes one row
   against that person and is paid off exactly like any other due, oldest first.
   A due date is always given — a debt with no date is never late, so nothing
   would ever remind him of it — and it counts from today, not from "since". */

type Way = 'get' | 'owe'

export function OldDueSheet({ s, way: initialWay, onClose, onDone }: {
  s: State; way?: Way; onClose: () => void; onDone: (msg: string) => void
}) {
  const [way, setWay] = useState<Way | null>(initialWay ?? null)
  const [party, setParty] = useState<ID | ''>('')
  const [newName, setNewName] = useState<string | null>(null)
  const [newPhone, setNewPhone] = useState('')
  const [book, setBook] = useState(false)
  const [amount, setAmount] = useState('')
  const [since, setSince] = useState(isoDate())
  const [dueDays, setDueDays] = useState<number | null>(null)

  // The people most likely to be on this side of the book come first.
  const all = parties(s)
  const kind = way === 'owe' ? 'supplier' : 'client'
  const people = [...all.filter((p) => p.ptype === kind), ...all.filter((p) => p.ptype !== kind)]
  const picked = all.find((p) => p.id === party)
  const days = dueDays ?? defaultDueDays(picked?.terms_days ?? 0)
  const named = !!party || !!newName?.trim()
  const ready = !!way && named && Number(amount) > 0

  const saveOnce = useOnce(async () => {
    if (!way) return
    let pid = party
    let name = picked?.name_bn || ''
    if (!pid) {
      const p: Party = { id: uid(), kind: 'party', name_bn: newName!.trim(), ptype: kind, terms_days: 0, phone: newPhone.trim(), updated_at: new Date().toISOString() }
      await saveMaster(p)
      pid = p.id
      name = p.name_bn
    }
    const e: StockEntry = {
      id: uid(), kind: 'stock', batch: uid(), date: since, project_id: '', created_at: new Date().toISOString(),
      item_id: '', dir: way === 'get' ? OPENING_GET : OPENING_OWE, qty: 0, rate: 0, amount: Number(amount),
      party_id: pid, due_date: dueFrom(isoDate(), days), paid: false, photo_id: '',
    }
    await saveEntries([e])
    scheduleSync(300)
    onDone(way === 'get' ? tf('{0} দেবেন {1} — লেখা হল', name, money(Number(amount))) : tf('{0}-কে দিতে হবে {1} — লেখা হল', name, money(Number(amount))))
  })

  if (book) {
    return <ContactPicker onClose={() => setBook(false)}
      onPicked={(c) => { setParty(''); setNewName(c.name); setNewPhone(c.phone); setBook(false) }} />
  }

  return (
    <Sheet title="পুরোনো বাকি" onClose={onClose}>
      <p className="small muted" style={{ marginBottom: '.6rem' }}>{t('কাগজের খাতায় যা বাকি আছে, একটা একটা করে তুলে দিন।')}</p>
      <div className="yesno">
        <button className={way === 'get' ? 'on' : ''} onClick={() => setWay('get')}>{t('উনি আমাকে দেবেন')}</button>
        <button className={way === 'owe' ? 'on' : ''} onClick={() => setWay('owe')}>{t('আমি ওনাকে দেব')}</button>
      </div>

      <p className="sectionlabel">{t('কে?')}</p>
      <div className="chips">
        {people.slice(0, 8).map((p) => (
          <Chip key={p.id} on={party === p.id} onClick={() => { setParty(p.id); setNewName(null); setDueDays(null) }}>{p.name_bn}</Chip>
        ))}
        <Chip onClick={() => setBook(true)}>{t('ফোনবুক থেকে')}</Chip>
        <Chip on={newName !== null && !party} onClick={() => { setParty(''); setNewName(newName ?? ''); setDueDays(null) }}>{t('+ নতুন')}</Chip>
      </div>
      {newName !== null && !party && (
        <Field label="নাম"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus /></Field>
      )}

      <p className="sectionlabel">{t('কত টাকা?')}</p>
      <MoneyPad value={amount} onChange={setAmount} />

      <p className="sectionlabel">{t('কবে থেকে বাকি?')}</p>
      <div className="chips">
        <Chip on={since === isoDate()} onClick={() => setSince(isoDate())}>{t('আজ')}</Chip>
      </div>
      <input className="input" type="date" value={since} max={isoDate()} style={{ marginTop: '.5rem' }}
        onChange={(e) => e.target.value && setSince(e.target.value)} />

      <DueChips question={way === 'owe' ? 'কবে দিতে হবে?' : 'কবে দেবে?'} days={days} onChange={setDueDays} own={picked?.terms_days} from={isoDate()} />

      <button className="btn primary" disabled={!ready} onClick={saveOnce} style={{ marginTop: '.9rem', width: '100%' }}>{t('সেভ করুন')}</button>
    </Sheet>
  )
}
