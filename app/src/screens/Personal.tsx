import { useMemo, useState } from 'react'
import { Icon, TopBar, Chip, Pick, Sheet, Field, NumField, MoneyPad, useToast, Toast, Empty } from '../ui/kit'
import { useStore, saveEntries, saveMaster, saveSettings, noteChip, allBills } from '../lib/store'
import { uid } from '../lib/db'
import { money, toBn, isoDate, dateBn, dayLabelBn, addDays } from '../lib/bn'
import { MONEY_HEADS_PERSONAL, PAY_MODES, type Bill, type MoneyEntry } from '../lib/model'
import { rankHeads, amountChips } from '../lib/suggest'
import { DRAWING_HEAD, liveEntries } from '../lib/calc'
import { openBills, billTotals, blankBill, payBill, daysAway, isOverdue } from '../lib/bills'
import { hashPin, checkPin } from '../lib/pin'
import { scheduleSync } from '../lib/sync'
import { t, tf } from '../lib/i18n'
import { useBackHandler } from '../lib/back'

export function Personal({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [open, setOpen] = useState(!s.settings.pin_hash)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [setting, setSetting] = useState(false)
  const [adding, setAdding] = useState<null | 'expense' | 'drawing'>(null)
  const [bill, setBill] = useState<Bill | null>(null)
  useBackHandler(() => setAdding(null), adding !== null)
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
          <h2 className="question" style={{ textAlign: 'center' }}>{t("পাসকোড দিন")}</h2>
          <p className="hint" style={{ textAlign: 'center' }}>{wrong ? t('মিলল না, আবার দিন।') : t('এই খাতা শুধু আপনার।')}</p>
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
      <TopBar title="নিজের খরচ" sub={tf('চলতি মাসে {0}', money(spent))} onBack={onBack}
        right={<button className="iconbtn" onClick={() => setSetting(true)} aria-label="পাসকোড"><Icon name="lock" /></button>} />
      <div className="scroll">
        <div className="statgrid" style={{ marginTop: '1rem' }}>
          <div className="stat info"><span className="k">{t("এ মাসে খরচ")}</span><span className="v num">{money(spent)}</span></div>
          <div className="stat warn"><span className="k">{t("ব্যবসা থেকে নেওয়া")}</span><span className="v num">{money(drawn)}</span></div>
        </div>

        <div className="tilegrid" style={{ marginTop: '.9rem' }}>
          <button className="tile" onClick={() => setAdding('expense')}>
            <Icon name="plus" size={22} /><span><span className="t" style={{ display: 'block' }}>{t("খরচ লিখুন")}</span><span className="s">{t("বাজার, ওষুধ, বিল")}</span></span>
          </button>
          <button className="tile" onClick={() => setAdding('drawing')}>
            <Icon name="wallet" size={22} stroke={1.6} /><span><span className="t" style={{ display: 'block' }}>{t("ব্যবসা থেকে নিলাম")}</span><span className="s">{t("ঘরের জন্য টাকা")}</span></span>
          </button>
        </div>

        <BillSection bills={openBills(allBills(s), true)}
          onAdd={() => setBill(blankBill(true))}
          onOpen={(b) => setBill(b)} />

        <p className="sectionlabel">{t("এ মাসের হিসাব")}</p>
        {rows.length === 0 && <Empty>{t("এ মাসে এখনও কিছু লেখা হয়নি।")}</Empty>}
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
          {t("ব্যবসা থেকে নেওয়া টাকা ব্যবসার খরচ নয় — তাই কাজের হিসাবে এটা ধরা হয় না, শুধু হাতের টাকা কমে।")}
        </p>
      </div>
      {bill && (
        <BillSheet bill={bill} onClose={() => setBill(null)}
          onSaved={(m) => { setBill(null); toast.show(m) }} />
      )}
      {setting && <PinSheet onClose={() => setSetting(false)} onSaved={() => { setSetting(false); toast.show('পাসকোড সেভ হয়েছে') }} />}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* ---------- what is coming ----------

   The one question this answers: is anything due before I next look at this
   screen? So it leads with the overdue and the near, says the date in words,
   and puts the amount where the eye already is. Nothing is a total until he
   asks — a list of five bills adding to a number he cannot pay this week is
   not information, it is worry. */
function BillSection({ bills, onAdd, onOpen }: {
  bills: Bill[]; onAdd: () => void; onOpen: (b: Bill) => void
}) {
  const t2 = billTotals(bills, true)
  return (
    <>
      <p className="sectionlabel">{t("দিতে হবে")}</p>
      {bills.length === 0 && (
        <Empty>{t("ঘরভাড়া, ইস্কুলের মাইনে, বিদ্যুৎ বিল — যা তারিখ ধরে দিতে হয়, একবার লিখে রাখলে সেদিন সকালে ফোন মনে করিয়ে দেবে।")}</Empty>
      )}
      {bills.length > 0 && (
        <div className="rowlist">
          {bills.slice(0, 6).map((b) => {
            const away = daysAway(b)
            const late = isOverdue(b)
            return (
              <Pick key={b.id}
                title={b.name_bn + (b.to_bn ? ' — ' + b.to_bn : '')}
                sub={late ? tf('{0} দিন পেরিয়ে গেছে', toBn(Math.abs(away)))
                  : away === 0 ? t('আজই')
                  : away === 1 ? t('কাল')
                  : tf('{0} দিন পরে · {1}', toBn(away), dateBn(b.due_date))}
                right={<span className="num" style={{ color: late ? 'var(--crit)' : undefined }}>{money(b.amount)}</span>}
                onClick={() => onOpen(b)} />
            )
          })}
        </div>
      )}
      <div className="chips" style={{ marginTop: '.6rem' }}>
        <Chip onClick={onAdd}>{t('+ নতুন তারিখ')}</Chip>
        {t2.overdue > 0 && <Chip sub={money(t2.overdue)}>{t('পেরিয়ে গেছে')}</Chip>}
        {t2.week > 0 && <Chip sub={money(t2.week)}>{t('সাত দিনে')}</Chip>}
      </div>
    </>
  )
}

/* Adding one, and paying it. Paying writes an ordinary expense row, so the
   money shows up in the month exactly like anything he types by hand. */
function BillSheet({ bill, onClose, onSaved }: {
  bill: Bill; onClose: () => void; onSaved: (msg: string) => void
}) {
  const [b, setB] = useState<Bill>(bill)
  const fresh = !bill.updated_at
  const set = (p: Partial<Bill>) => setB({ ...b, ...p })
  const ok = b.name_bn.trim() !== '' && (b.amount || 0) > 0 && b.due_date !== ''

  const save = async () => {
    await saveMaster({ ...b, name_bn: b.name_bn.trim(), to_bn: b.to_bn.trim(), updated_at: new Date().toISOString() })
    scheduleSync(300)
    onSaved(fresh ? 'মনে করিয়ে দেওয়া হবে' : 'সেভ হয়েছে')
  }

  return (
    <Sheet title={fresh ? 'নতুন তারিখ' : b.name_bn} onClose={onClose}>
      <Field label="কীসের টাকা">
        <input className="input" value={b.name_bn} onChange={(e) => set({ name_bn: e.target.value })}
          placeholder="যেমন — ঘরভাড়া" autoFocus />
      </Field>
      <div className="chips" style={{ margin: '-.5rem 0 .9rem' }}>
        {MONEY_HEADS_PERSONAL.filter((h) => h !== 'অন্যান্য').map((h) => (
          <Chip key={h} on={b.name_bn === h} onClick={() => set({ name_bn: h })}>{t(h)}</Chip>
        ))}
      </div>
      <Field label="কাকে (ইচ্ছে হলে)">
        <input className="input" value={b.to_bn} onChange={(e) => set({ to_bn: e.target.value })} />
      </Field>
      <Field label="কত টাকা"><NumField value={b.amount} onChange={(v) => set({ amount: v ?? 0 })} /></Field>
      <Field label="কোন তারিখে">
        <input className="input" type="date" value={b.due_date} onChange={(e) => set({ due_date: e.target.value })} />
      </Field>
      <div className="chips" style={{ margin: '-.5rem 0 .9rem' }}>
        {[0, 1, 7, 30].map((d) => (
          <Chip key={d} on={b.due_date === addDays(isoDate(), d)} onClick={() => set({ due_date: addDays(isoDate(), d) })}>
            {d === 0 ? t('আজ') : d === 1 ? t('কাল') : tf('{0} দিন পরে', toBn(d))}
          </Chip>
        ))}
      </div>
      <Field label="কতবার">
        <div className="chips">
          <Chip on={b.repeat === 'once'} onClick={() => set({ repeat: 'once' })}>{t('একবারই')}</Chip>
          <Chip on={b.repeat === 'monthly'} onClick={() => set({ repeat: 'monthly' })} sub={t('প্রতি মাসে এই তারিখে')}>{t('প্রতি মাসে')}</Chip>
        </div>
      </Field>
      <button className="btn primary" disabled={!ok} style={{ marginTop: '.4rem', width: '100%' }} onClick={save}>
        {t("সেভ করুন")}
      </button>
      {!fresh && (
        <button className="btn" style={{ marginTop: '.6rem', width: '100%' }}
          onClick={async () => { await payBill(b); onSaved('দেওয়া হয়েছে বলে লেখা হল') }}>
          {t("দিয়ে দিয়েছি")}
        </button>
      )}
      <p className="small muted" style={{ marginTop: '.8rem' }}>
        {t("এটা শুধু মনে করিয়ে দেওয়ার জন্য। টাকা দেওয়ার দিন \"দিয়ে দিয়েছি\" চাপলে খরচটা নিজে থেকেই খাতায় উঠে যাবে।")}
      </p>
    </Sheet>
  )
}

function AddPersonal({ kind, onDone }: { kind: 'expense' | 'drawing'; onDone: (msg?: string) => void }) {
  const s = useStore((x) => x)
  const [head, setHead] = useState(kind === 'drawing' ? DRAWING_HEAD : '')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState(PAY_MODES[0])
  const [writing, setWriting] = useState(false)
  const [own, setOwn] = useState('')
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
    onDone(kind === 'drawing' ? t('লেখা হল') : `${head} — ${money(e.amount)}`)
  }

  if (!head) {
    return (
      <>
        <TopBar title="নিজের খরচ" onBack={() => onDone()} />
        <div className="scroll">
          <h2 className="question">{t("কীসের খরচ?")}</h2>
          <div className="chips">
            {ordered.slice(0, 8).map((h) => <Chip key={h} onClick={() => { noteChip(true); setHead(h) }}>{h}</Chip>)}
            {/* The list can never be complete — a wedding gift, a bike
                repair, a hospital trip. Whatever he types here becomes a
                chip of its own next time, because the list is ranked from
                what he has actually written. */}
            <Chip onClick={() => setWriting(true)}>{t('+ নিজে লিখুন')}</Chip>
          </div>
          {writing && (
            <div style={{ marginTop: '1rem' }}>
              <Field label="কীসের খরচ">
                <input className="input" value={own} onChange={(e) => setOwn(e.target.value)}
                  placeholder="যেমন — সাইকেল সারানো" autoFocus />
              </Field>
              <button className="btn primary" style={{ width: '100%' }} disabled={!own.trim()}
                onClick={() => { noteChip(true); setHead(own.trim()) }}>{t('এগিয়ে যান')}</button>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title={head} onBack={() => (kind === 'drawing' ? onDone() : setHead(''))} />
      <div className="scroll">
        <h2 className="question">{t("কত টাকা?")}</h2>
        {kind === 'drawing' && <p className="hint">{t("ব্যবসার হাতের টাকা থেকে এই টাকাটা কমে যাবে।")}</p>}
        <MoneyPad value={amount} onChange={setAmount} chips={chips} onChipTaken={() => noteChip(true)} />
        <p className="sectionlabel">{t("কীভাবে")}</p>
        <div className="chips">{PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}</div>
      </div>
      <div className="actionbar">
        <button className="btn primary" disabled={!Number(amount)} onClick={save}>{t("সেভ করুন")}</button>
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
        <h2>{stage === 'first' ? t('নতুন পাসকোড') : t('আরেকবার দিন')}</h2>
        <p className="hint">{t("চার সংখ্যার একটা কোড। ভুলে গেলে সেটিংস থেকে বদলাতে হবে।")}</p>
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', margin: '.6rem 0 1rem' }}>
          {[0, 1, 2, 3].map((k) => (
            <span key={k} style={{ width: '1rem', height: '1rem', borderRadius: '50%', background: (stage === 'first' ? pin : again).length > k ? 'var(--accent)' : 'var(--line)' }} />
          ))}
        </div>
        <MoneyPad prefix="" value={stage === 'first' ? pin : again}
          onChange={(v) => (stage === 'first' ? setPin(v.slice(0, 4)) : setAgain(v.slice(0, 4)))} />
        {stage === 'again' && (
          <button className="btn primary" style={{ marginTop: '.8rem' }} disabled={again !== pin} onClick={save}>
            {again.length === 4 && again !== pin ? t('মিলছে না') : t('সেভ করুন')}
          </button>
        )}
        {stage === 'first' && <button className="btn ghost" style={{ marginTop: '.8rem', width: '100%' }} onClick={onClose}>{t("থাক")}</button>}
      </div>
    </div>
  )
}

