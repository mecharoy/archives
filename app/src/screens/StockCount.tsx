import { useEffect, useMemo, useState } from 'react'
import { TopBar, Pick, Chip, Sheet, MoneyPad, Field, NumField, Empty } from '../ui/kit'
import { items, saveEntries, saveMaster, type State } from '../lib/store'
import { uid, kvGet, kvSet, kvDel } from '../lib/db'
import { isoDate, money, num, toBn } from '../lib/bn'
import { searchCatalog, CATS } from '../lib/catalog'
import type { ID, Item, StockEntry } from '../lib/model'
import { useOnce } from '../lib/once'
import { scheduleSync } from '../lib/sync'
import { useBackHandler } from '../lib/back'
import { t, tf } from '../lib/i18n'

/* পুরো মজুত একবারে — the whole shop counted in one sitting, at setup.

   One list: find each thing on the shelf (his own items, or the catalogue,
   grouped and searchable), say how many, and — if he knows it — what he paid.
   Saving writes one count row per item, which is exactly what ‘মাল গোনা’
   writes for one item, so the shelf starts from what is really there.

   The list is kept as a draft on every change: a count of a whole shop takes
   an hour, and a phone call in the middle must not cost him the first half. */

interface Row { key: string; item_id: ID | ''; name_bn: string; unit_bn: string; qty: number | null; rate: number | null }
const DRAFT = 'stock_count_draft'

export function StockCount({ s, onDone }: { s: State; onDone: (msg?: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [edit, setEdit] = useState<Row | null>(null)
  useBackHandler(() => onDone())

  useEffect(() => { void kvGet<Row[]>(DRAFT, []).then(setRows) }, [])
  const keep = (next: Row[]) => { setRows(next); void kvSet(DRAFT, next) }

  const mine = items(s)
  const have = useMemo(() => new Set(mine.map((i) => i.name_bn)), [mine])
  const needle = q.trim()
  const ownHits = needle ? mine.filter((i) => i.name_bn.includes(needle)) : []
  const catHits = useMemo(() => searchCatalog(q, cat, have).slice(0, 40), [q, cat, have])

  const add = (r: Omit<Row, 'key' | 'qty' | 'rate'>, rate: number | null) => {
    const list = rows ?? []
    const found = list.find((x) => x.name_bn === r.name_bn)
    const row = found ?? { ...r, key: uid(), qty: null, rate }
    if (!found) keep([...list, row])
    setQ(''); setEdit(row)
  }

  const saveOnce = useOnce(async () => {
    const list = (rows ?? []).filter((r) => r.qty != null)
    const batch = uid()
    const now = new Date().toISOString()
    const out: StockEntry[] = []
    for (const r of list) {
      let id = r.item_id
      if (!id) {
        const it: Item = { id: uid(), kind: 'item', name_bn: r.name_bn, unit_bn: r.unit_bn, last_rate: r.rate, active: true, updated_at: now }
        await saveMaster(it)
        id = it.id
      }
      const qty = r.qty as number
      const rate = r.rate ?? 0
      out.push({
        id: uid(), kind: 'stock', batch, date: isoDate(), project_id: '', created_at: now, item_id: id, dir: 'count',
        qty, rate, amount: Math.round(qty * rate * 100) / 100, party_id: '', due_date: '', paid: true, photo_id: '',
      })
    }
    await saveEntries(out)
    await kvDel(DRAFT)
    scheduleSync(300)
    onDone(tf('{0} রকম মাল গোনা হল', toBn(out.length)))
  })

  if (!rows) return null
  const counted = rows.filter((r) => r.qty != null)
  const value = counted.reduce((a, r) => a + (r.qty as number) * (r.rate ?? 0), 0)

  return (
    <>
      <TopBar title="পুরো মজুত একবারে" sub={tf('{0} রকম · {1}', toBn(counted.length), money(value))} onBack={() => onDone()} />
      <div className="scroll">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('মালের নাম লিখে খুঁজুন')} />
        <div className="chips" style={{ marginTop: '.5rem' }}>
          {CATS.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}</Chip>)}
        </div>
        {(ownHits.length > 0 || catHits.length > 0) && (
          <div className="rowlist" style={{ marginTop: '.6rem' }}>
            {ownHits.map((i) => <Pick key={i.id} title={i.name_bn} sub={t('আপনার মাল')} onClick={() => add({ item_id: i.id, name_bn: i.name_bn, unit_bn: i.unit_bn }, i.last_rate)} />)}
            {catHits.map((c) => <Pick key={c.name_bn} title={c.name_bn} sub={c.unit_bn} onClick={() => add({ item_id: '', name_bn: c.name_bn, unit_bn: c.unit_bn }, null)} />)}
          </div>
        )}

        <p className="sectionlabel">{t('গোনা মাল')}</p>
        {rows.length === 0 && <Empty>{t('উপরে খুঁজে একটা একটা করে মাল যোগ করুন।')}</Empty>}
        <div className="rowlist">
          {rows.map((r) => (
            <Pick key={r.key} title={r.name_bn}
              sub={r.qty == null ? t('কত আছে লেখা হয়নি') : `${num(r.qty, r.qty % 1 ? 2 : 0)} ${t(r.unit_bn)}${r.rate ? ' · ' + money(r.rate) : ''}`}
              onClick={() => setEdit(r)} />
          ))}
        </div>
      </div>
      <div className="actionbar">
        <button className="btn primary" disabled={!counted.length} onClick={saveOnce}>{t('খাতায় তুলুন')}</button>
      </div>
      {edit && (
        <RowSheet row={edit} onClose={() => setEdit(null)}
          onSave={(r) => { keep((rows ?? []).map((x) => (x.key === r.key ? r : x))); setEdit(null) }}
          onRemove={() => { keep((rows ?? []).filter((x) => x.key !== edit.key)); setEdit(null) }} />
      )}
    </>
  )
}

function RowSheet({ row, onClose, onSave, onRemove }: { row: Row; onClose: () => void; onSave: (r: Row) => void; onRemove: () => void }) {
  const [qty, setQty] = useState(row.qty != null ? String(row.qty) : '')
  const [rate, setRate] = useState<number | null>(row.rate)
  return (
    <Sheet title={row.name_bn} onClose={onClose}>
      <p className="sectionlabel" style={{ marginTop: 0 }}>{tf('কত {0} আছে?', t(row.unit_bn))}</p>
      <MoneyPad value={qty} onChange={setQty} prefix="" allowDecimal />
      <Field label="কেনা দর (ইচ্ছে হলে)"><NumField value={rate} onChange={setRate} decimal /></Field>
      <button className="btn primary" disabled={qty === ''} style={{ width: '100%', marginTop: '.5rem' }}
        onClick={() => onSave({ ...row, qty: Number(qty), rate })}>{t('ঠিক আছে')}</button>
      <button className="btn ghost" style={{ width: '100%', marginTop: '.5rem' }} onClick={onRemove}>{t('বাদ দিন')}</button>
    </Sheet>
  )
}
