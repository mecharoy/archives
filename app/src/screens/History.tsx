import { useMemo, useState } from 'react'
import { Icon, TopBar, Pick, Sheet, useToast, Toast, Empty } from '../ui/kit'
import { useStore, saveEntries, nameOf, type State } from '../lib/store'
import { money, toBn, num, dateBn, dayLabelBn, isoDate, addDays } from '../lib/bn'
import type { Entry } from '../lib/model'
import { liveEntries } from '../lib/calc'
import { reversalOf, newDraft, type Draft } from '../lib/draft'
import { scheduleSync } from '../lib/sync'

export function History({ onBack, onEnterDate }: { onBack: () => void; onEnterDate: (d: Draft) => void }) {
  const s = useStore((x) => x)
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [pickDate, setPickDate] = useState(false)
  const toast = useToast()

  const days = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of liveEntries(s.entries)) {
      const list = m.get(e.date) || []
      list.push(e)
      m.set(e.date, list)
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 90)
  }, [s.entries])

  return (
    <>
      <TopBar title="পুরোনো হিসাব" sub={`${toBn(days.length)} দিনের লেখা`} onBack={onBack}
        right={<button className="iconbtn" onClick={() => setPickDate(true)} aria-label="তারিখ বেছে নিন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {days.length === 0 && <Empty>এখনও কিছু লেখা হয়নি।</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {days.map(([date, rows]) => {
            const cost = dayCost(rows)
            return (
              <Pick key={date} title={dayLabelBn(date)} sub={`${dateBn(date)} · ${toBn(rows.length)} লাইন`}
                right={<span className="num" style={{ fontWeight: 600 }}>{money(cost)}</span>}
                onClick={() => setOpenDate(date)} />
            )
          })}
        </div>
      </div>

      {openDate && (
        <Sheet title={dateBn(openDate)} onClose={() => setOpenDate(null)}>
          <DayDetail s={s} date={openDate} onCorrected={(m) => { toast.show(m); setOpenDate(null) }} />
        </Sheet>
      )}

      {pickDate && (
        <Sheet title="কোন দিনের হিসাব?" onClose={() => setPickDate(false)}>
          <p className="hint">যে দিনটা বাদ পড়ে গেছে সেটা বেছে নিন।</p>
          <div className="rowlist">
            {Array.from({ length: 10 }, (_, k) => addDays(isoDate(), -k)).map((d) => (
              <Pick key={d} title={dayLabelBn(d)} sub={dateBn(d)}
                onClick={() => { setPickDate(false); onEnterDate(newDraft(d)) }} />
            ))}
          </div>
        </Sheet>
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function dayCost(rows: Entry[]): number {
  let t = 0
  for (const e of rows) {
    if (e.kind === 'attendance') t += e.amount
    else if (e.kind === 'stock' && (e.dir === 'in' || e.dir === 'transfer')) t += e.amount
    else if (e.kind === 'money' && e.dir === 'paid' && !e.personal) t += e.amount
  }
  return t
}

function DayDetail({ s, date, onCorrected }: { s: State; date: string; onCorrected: (m: string) => void }) {
  const rows = liveEntries(s.entries).filter((e) => e.date === date)
  const [confirm, setConfirm] = useState<Entry | null>(null)

  const undo = async (e: Entry) => {
    await saveEntries([reversalOf(e)])
    scheduleSync(300)
    onCorrected('সংশোধন লেখা হল')
  }

  return (
    <>
      <div className="card">
        {rows.filter((e) => e.kind !== 'day').map((e) => (
          <div className="review-row" key={e.id}>
            <span>
              <span className="t">{describe(s, e)}</span>
              <span className="k">{label(e)}</span>
            </span>
            <span className="v num">{amountOf(e) ? money(amountOf(e)) : ''}</span>
            <button className="iconbtn" onClick={() => setConfirm(e)} aria-label="সংশোধন"><Icon name="edit" size={18} /></button>
          </div>
        ))}
        {rows.filter((e) => e.kind !== 'day').length === 0 && <p className="hint">এই দিনে শুধু ‘কাজ হয়নি’ লেখা আছে।</p>}
      </div>
      <p className="small muted" style={{ marginTop: '.8rem' }}>
        কোনো লাইন মুছে ফেলা হয় না — ভুল হলে তার উল্টো লাইন লেখা হয়, তাই খাতায় সব ইতিহাস থেকে যায়।
      </p>
      {confirm && (
        <div className="sheet-backdrop" onClick={() => setConfirm(null)}>
          <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
            <div className="grip" />
            <h2>এই লাইনটা বাতিল করবেন?</h2>
            <p className="hint">{describe(s, confirm)} — {money(amountOf(confirm))}</p>
            <div className="actionbar" style={{ borderTop: 0, padding: '.6rem 0 0' }}>
              <button className="btn ghost" onClick={() => setConfirm(null)}>থাক</button>
              <button className="btn danger" onClick={() => { const e = confirm; setConfirm(null); void undo(e) }}>বাতিল করুন</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function describe(s: State, e: Entry): string {
  switch (e.kind) {
    case 'attendance': return `${nameOf(s, e.worker_id)} — মজুরি`
    case 'stock': return `${nameOf(s, e.item_id)} — ${num(e.qty, e.qty % 1 ? 2 : 0)}`
    case 'money': return e.head_bn
    case 'progress': return 'কাজের অগ্রগতি'
    default: return 'দিনের হিসাব'
  }
}

function label(e: Entry): string {
  switch (e.kind) {
    case 'attendance': return e.presence === 'half' ? 'আধা দিন' : e.presence === 'ot' ? 'ওভারটাইম' : 'পুরো দিন'
    case 'stock': return e.dir === 'in' ? (e.paid ? 'কেনা' : 'বাকিতে কেনা') : e.dir === 'sale' ? 'বিক্রি' : e.dir === 'transfer' ? 'কাজে পাঠানো' : 'গোনা'
    case 'money': return e.personal ? 'নিজের খাতা' : e.mode
    case 'progress': return e.state === 'done' ? 'ধাপ শেষ' : 'অর্ধেক'
    default: return ''
  }
}

function amountOf(e: Entry): number {
  if (e.kind === 'attendance') return e.amount + e.advance
  if (e.kind === 'stock') return e.amount
  if (e.kind === 'money') return e.amount
  return 0
}

