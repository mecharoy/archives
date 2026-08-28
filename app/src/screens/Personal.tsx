import { useMemo, useState } from 'react'
import { Icon, TopBar, Chip, MoneyPad, useToast, Toast, Empty } from '../ui/kit'
import { useStore, saveEntries, saveSettings, noteChip } from '../lib/store'
import { uid } from '../lib/db'
import { money, isoDate, dayLabelBn } from '../lib/bn'
import { MONEY_HEADS_PERSONAL, PAY_MODES, type MoneyEntry } from '../lib/model'
import { rankHeads, amountChips } from '../lib/suggest'
import { DRAWING_HEAD, liveEntries } from '../lib/calc'
import { hashPin, checkPin } from '../lib/pin'
import { scheduleSync } from '../lib/sync'

export function Personal({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [open, setOpen] = useState(!s.settings.pin_hash)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [setting, setSetting] = useState(false)
  const [adding, setAdding] = useState<null | 'expense' | 'drawing'>(null)
  const toast = useToast()

  const rows = useMemo(() => {
    const from = isoDate().slice(0, 8) + '01'
    return (liveEntries(s.entries).filter((e) => e.kind === 'money' && (e as MoneyEntry).personal) as MoneyEntry[])
      .filter((e) => e.date >= from)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [s.entries])

  const spent = rows.filter((r) => r.dir === 'paid').reduce((a, r) => a + r.amount, 0)
  const drawn = rows.filter((r) => r.head_bn === DRAWING_HEAD).reduce((a, r) => a + r.amount, 0)

  const tryPin = async (p: string) => {
    setPin(p)
    if (p.length < 4) { setWrong(false); return }
    if (await checkPin(p, s.settings.pin_hash)) setOpen(true)
    else { setWrong(true); setPin('') }
  }

  if (!open) {
    return (
      <>
        <TopBar title="নিজের খরচ" onBack={onBack} />
        <div className="scroll">
          <div style={{ textAlign: 'center', padding: '2.5rem 0 1rem', color: 'var(--muted)' }}><Icon name="lock" size={36} stroke={1.5} /></div>
          <h2 className="question" style={{ textAlign: 'center' }}>পাসকোড দিন</h2>
          <p className="hint" style={{ textAlign: 'center' }}>{wrong ? 'মিলল না, আবার দিন।' : 'এই খাতা শুধু আপনার।'}</p>
          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', margin: '1rem 0 1.4rem' }}>
            {[0, 1, 2, 3].map((k) => (
              <span key={k} style={{
                width: '1rem', height: '1rem', borderRadius: '50%',
                background: pin.length > k ? 'var(--accent)' : 'var(--line)',
              }} />
            ))}
          </div>
          <MoneyPad value={pin} onChange={(v) => void tryPin(v.slice(0, 4))} prefix="" />
        </div>
      </>
    )
  }

  if (adding) return <AddPersonal kind={adding} onDone={(m) => { setAdding(null); if (m) toast.show(m) }} />

  return (
    <>
      <TopBar title="নিজের খরচ" sub={`চলতি মাসে ${money(spent)}`} onBack={onBack}
        right={<button className="iconbtn" onClick={() => setSetting(true)} aria-label="পাসকোড"><Icon name="lock" /></button>} />
      <div className="scroll">
        <div className="statgrid" style={{ marginTop: '1rem' }}>
          <div className="stat info"><span className="k">এ মাসে খরচ</span><span className="v num">{money(spent)}</span></div>
          <div className="stat warn"><span className="k">ব্যবসা থেকে নেওয়া</span><span className="v num">{money(drawn)}</span></div>
        </div>

        <div className="tilegrid" style={{ marginTop: '.9rem' }}>
          <button className="tile" onClick={() => setAdding('expense')}>
            <Icon name="plus" size={22} /><span><span className="t" style={{ display: 'block' }}>খরচ লিখুন</span><span className="s">বাজার, ওষুধ, বিল</span></span>
          </button>
          <button className="tile" onClick={() => setAdding('drawing')}>
            <Icon name="wallet" size={22} stroke={1.6} /><span><span className="t" style={{ display: 'block' }}>ব্যবসা থেকে নিলাম</span><span className="s">ঘরের জন্য টাকা</span></span>
          </button>
        </div>

        <p className="sectionlabel">এ মাসের হিসাব</p>
        {rows.length === 0 && <Empty>এ মাসে এখনও কিছু লেখা হয়নি।</Empty>}
        {rows.length > 0 && (
          <div className="card">
            {rows.map((r) => (
              <div className="review-row" key={r.id}>
                <span><span className="t">{r.head_bn}</span><span className="k">{dayLabelBn(r.date)} · {r.mode}</span></span>
                <span className="v num">{money(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="small muted" style={{ marginTop: '1rem' }}>
          ব্যবসা থেকে নেওয়া টাকা ব্যবসার খরচ নয় — তাই কাজের হিসাবে এটা ধরা হয় না, শুধু হাতের টাকা কমে।
        </p>
      </div>
      {setting && <PinSheet onClose={() => setSetting(false)} onSaved={() => { setSetting(false); toast.show('পাসকোড সেভ হয়েছে') }} />}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function AddPersonal({ kind, onDone }: { kind: 'expense' | 'drawing'; onDone: (msg?: string) => void }) {
  const s = useStore((x) => x)
  const [head, setHead] = useState(kind === 'drawing' ? DRAWING_HEAD : '')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState(PAY_MODES[0])
  const ranked = rankHeads(s.entries, true).filter((h) => h !== DRAWING_HEAD)
  const ordered = [...ranked, ...MONEY_HEADS_PERSONAL.filter((h) => !ranked.includes(h))]
  const chips = amountChips(s.entries, head, true)

  const save = async () => {
    const e: MoneyEntry = {
      id: uid(), kind: 'money', batch: uid(), date: isoDate(), project_id: '',
      created_at: new Date().toISOString(), head_bn: head,
      dir: kind === 'drawing' ? 'received' : 'paid',
      amount: Number(amount) || 0, party_id: '', mode, note: '', personal: true, photo_id: '',
    }
    await saveEntries([e])
    scheduleSync(300)
    onDone(kind === 'drawing' ? 'লেখা হল' : `${head} — ${money(e.amount)}`)
  }

  if (!head) {
    return (
      <>
        <TopBar title="নিজের খরচ" onBack={() => onDone()} />
        <div className="scroll">
          <h2 className="question">কীসের খরচ?</h2>
          <div className="chips">
            {ordered.slice(0, 6).map((h) => <Chip key={h} onClick={() => { noteChip(true); setHead(h) }}>{h}</Chip>)}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title={head} onBack={() => (kind === 'drawing' ? onDone() : setHead(''))} />
      <div className="scroll">
        <h2 className="question">কত টাকা?</h2>
        {kind === 'drawing' && <p className="hint">ব্যবসার হাতের টাকা থেকে এই টাকাটা কমে যাবে।</p>}
        <MoneyPad value={amount} onChange={setAmount} chips={chips} onChipTaken={() => noteChip(true)} />
        <p className="sectionlabel">কীভাবে</p>
        <div className="chips">{PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}</div>
      </div>
      <div className="actionbar">
        <button className="btn primary" disabled={!Number(amount)} onClick={save}>সেভ করুন</button>
      </div>
    </>
  )
}

export function PinSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const stage = pin.length === 4 ? 'again' : 'first'
  const save = async () => { await saveSettings({ pin_hash: await hashPin(pin) }); onSaved() }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>{stage === 'first' ? 'নতুন পাসকোড' : 'আরেকবার দিন'}</h2>
        <p className="hint">চার সংখ্যার একটা কোড। ভুলে গেলে সেটিংস থেকে বদলাতে হবে।</p>
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', margin: '.6rem 0 1rem' }}>
          {[0, 1, 2, 3].map((k) => (
            <span key={k} style={{ width: '1rem', height: '1rem', borderRadius: '50%', background: (stage === 'first' ? pin : again).length > k ? 'var(--accent)' : 'var(--line)' }} />
          ))}
        </div>
        <MoneyPad prefix="" value={stage === 'first' ? pin : again}
          onChange={(v) => (stage === 'first' ? setPin(v.slice(0, 4)) : setAgain(v.slice(0, 4)))} />
        {stage === 'again' && (
          <button className="btn primary" style={{ marginTop: '.8rem' }} disabled={again !== pin} onClick={save}>
            {again.length === 4 && again !== pin ? 'মিলছে না' : 'সেভ করুন'}
          </button>
        )}
        {stage === 'first' && <button className="btn ghost" style={{ marginTop: '.8rem', width: '100%' }} onClick={onClose}>থাক</button>}
      </div>
    </div>
  )
}

