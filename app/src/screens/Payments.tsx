import { useMemo, useState } from 'react'
import { Icon, TopBar, Pick, Chip, Sheet, MoneyPad, Field, useToast, Toast, Empty } from '../ui/kit'
import { useStore, saveEntries, nameOf, type State } from '../lib/store'
import { uid } from '../lib/db'
import { money, isoDate, dateBn, addDays } from '../lib/bn'
import { PAY_MODES, type ID, type MoneyEntry } from '../lib/model'
import { openDues, openReceivables, SETTLE_HEAD } from '../lib/calc'
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

export function Payments({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const toast = useToast()
  const [pay, setPay] = useState<{ party_id: ID; dir: 'paid' | 'received'; owed: number } | null>(null)

  const owe = useMemo(() => byParty(openDues(s.entries)), [s.entries])
  const get = useMemo(() => byParty(openReceivables(s.entries)), [s.entries])
  const oweTotal = owe.reduce((a, x) => a + x.amount, 0)
  const getTotal = get.reduce((a, x) => a + x.amount, 0)

  return (
    <>
      <TopBar title="টাকা দেওয়া-নেওয়া" sub={tf('দেবেন {0} · পাবেন {1}', money(oweTotal), money(getTotal))} onBack={onBack} />
      <div className="scroll">
        {owe.length === 0 && get.length === 0 && (
          <Empty>{t('কারও কাছে বাকি নেই, কারও কাছে পাওনাও নেই।')}</Empty>
        )}

        {owe.length > 0 && (
          <>
            <p className="sectionlabel">{t('যাদের দিতে হবে')}</p>
            <div className="rowlist">
              {owe.map((x) => (
                <Pick key={'o' + x.party_id} title={x.party_id ? nameOf(s, x.party_id) : t('নাম লেখা নেই')}
                  sub={x.oldest < isoDate() ? tf('{0} থেকে বাকি — সময় পেরিয়েছে', dateBn(x.oldest, false)) : tf('{0} তারিখে দিতে হবে', dateBn(x.oldest, false))}
                  right={<span className="num" style={{ color: x.oldest < isoDate() ? 'var(--crit)' : undefined }}>{money(x.amount)}</span>}
                  onClick={() => setPay({ party_id: x.party_id, dir: 'paid', owed: x.amount })} />
              ))}
            </div>
          </>
        )}

        {get.length > 0 && (
          <>
            <p className="sectionlabel">{t('যাদের কাছে পাওনা')}</p>
            <div className="rowlist">
              {get.map((x) => (
                <Pick key={'g' + x.party_id} title={x.party_id ? nameOf(s, x.party_id) : t('খুচরো খদ্দের')}
                  sub={x.oldest < isoDate() ? tf('{0} থেকে পাওনা — সময় পেরিয়েছে', dateBn(x.oldest, false)) : tf('{0} তারিখে পাওয়ার কথা', dateBn(x.oldest, false))}
                  right={<span className="num">{money(x.amount)}</span>}
                  onClick={() => setPay({ party_id: x.party_id, dir: 'received', owed: x.amount })} />
              ))}
            </div>
          </>
        )}
      </div>

      {pay && (
        <SettleSheet s={s} {...pay} onClose={() => setPay(null)}
          onDone={(msg) => { setPay(null); toast.show(msg) }} />
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function byParty(rows: { party_id: ID; amount: number; due_date: string }[]) {
  const map = new Map<ID, { party_id: ID; amount: number; oldest: string }>()
  for (const r of rows) {
    const cur = map.get(r.party_id)
    if (cur) { cur.amount += r.amount; if (r.due_date < cur.oldest) cur.oldest = r.due_date }
    else map.set(r.party_id, { party_id: r.party_id, amount: r.amount, oldest: r.due_date })
  }
  return [...map.values()].sort((a, b) => (a.oldest < b.oldest ? -1 : 1))
}

function SettleSheet({ s, party_id, dir, owed, onClose, onDone }: {
  s: State; party_id: ID; dir: 'paid' | 'received'; owed: number
  onClose: () => void; onDone: (msg: string) => void
}) {
  const [value, setValue] = useState(String(Math.round(owed)))
  const [mode, setMode] = useState(PAY_MODES[0])
  const [date, setDate] = useState(isoDate())
  const name = party_id ? nameOf(s, party_id) : dir === 'paid' ? t('নাম লেখা নেই') : t('খুচরো খদ্দের')
  const amount = Number(value) || 0

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
        <div className="chips">{PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}</div>
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
      <button className="btn primary" disabled={amount <= 0} onClick={save} style={{ marginTop: '.4rem', width: '100%' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
          <Icon name="check" size={18} />{t('সেভ করুন')}
        </span>
      </button>
    </Sheet>
  )
}
