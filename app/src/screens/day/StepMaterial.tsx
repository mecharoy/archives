import { useMemo, useState } from 'react'
import { Icon, Pick, Chip, Sheet, MoneyPad, Field, NumField } from '../../ui/kit'
import { items, parties, noteChip, nameOf, type State } from '../../lib/store'
import { uid } from '../../lib/db'
import { money, toBn, num, dayLabelBn, ofBn } from '../../lib/bn'
import type { DraftMat, DraftRet } from '../../lib/draft'
import { rankItems, rankParties, lastPurchase, qtyChips } from '../../lib/suggest'
import { capture } from '../../lib/photo'
import { defaultDueDays, dueFrom } from '../../lib/dues'
import { DueChips } from '../../ui/DueChips'
import type { ID, Item } from '../../lib/model'
import { t, tf, isEn } from '../../lib/i18n'
import { useBackHandler } from '../../lib/back'
import { NewItemSheet, NewPartySheet } from './NewSheets'
import { pad } from './common'

type Sub = 'ask' | 'item' | 'qty' | 'rate' | 'who' | 'retItem' | 'retQty'

/* মাল এল? — and, the same screens, দোকানের জন্য মাল কিনলেন?. A thing, how much, at what rate, then from whom
   and whether it is paid (a credit purchase always gets a date). For a job, material that came back off the
   site is a quiet link here rather than a question of its own: most evenings it never happens. */
export function StepMaterial({ s, date, list, setList, rets, setRets, rankFor, question, next }: {
  s: State; date: string
  list: DraftMat[]; setList: (l: DraftMat[]) => void
  rets?: DraftRet[]; setRets?: (l: DraftRet[]) => void
  rankFor: ID | ''; question: string; next: () => void
}) {
  const hasLines = list.length > 0 || (rets?.length ?? 0) > 0
  const [sub, setSub] = useState<Sub>('ask')
  const [cur, setCur] = useState<DraftMat | null>(null)
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [ret, setRet] = useState<{ item_id: ID; rate: number } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [newItem, setNewItem] = useState(false)
  // Back inside a line being written goes back inside it, not out to the previous question.
  const PREV: Partial<Record<Sub, Sub>> = { item: 'ask', qty: 'item', rate: 'qty', who: 'rate', retItem: 'ask', retQty: 'retItem' }
  useBackHandler(() => setSub(PREV[sub] ?? 'ask'), sub !== 'ask')

  const all = items(s)
  const ranked = useMemo(() => rankItems(s.entries, rankFor), [s.entries, rankFor])
  const top = pad(ranked.map((id) => all.find((x) => x.id === id)!).filter(Boolean), all, 3)
  const rest = all.filter((x) => !top.some((y) => y.id === x.id))
  const itemOf = (id: ID) => all.find((x) => x.id === id)
  const total = list.reduce((a, m) => a + m.qty * m.rate, 0) - (rets ?? []).reduce((a, r) => a + r.qty * r.rate, 0)

  const startItem = (item: Item) => {
    const lp = lastPurchase(s.entries, item.id)
    setCur({ key: uid(), item_id: item.id, qty: 0, rate: lp?.rate ?? item.last_rate ?? 0, party_id: lp?.party_id ?? '', due_date: '', paid: false, photo_id: '' })
    setQty('')
    setRate(String(lp?.rate ?? item.last_rate ?? ''))
    setSub('qty')
  }
  const startRet = (item: Item) => { setRet({ item_id: item.id, rate: item.last_rate ?? 0 }); setQty(''); setSub('retQty') }

  const itemChips = (pick: (it: Item) => void) => (
    <>
      <div className="chips">
        {top.map((it) => <Chip key={it.id} onClick={() => { noteChip(true); pick(it) }}>{it.name_bn}</Chip>)}
        {rest.length > 0 && <Chip onClick={() => { noteChip(false); setShowAll(true) }}>{t('আরও…')}</Chip>}
        {all.length === 0 && <Chip onClick={() => setNewItem(true)}>{t('নতুন মাল যোগ করুন')}</Chip>}
      </div>
      {showAll && (
        <Sheet title="সব মাল" onClose={() => setShowAll(false)}>
          <div className="rowlist">
            {all.map((it) => <Pick key={it.id} title={it.name_bn} sub={it.unit_bn} onClick={() => { setShowAll(false); pick(it) }} />)}
            <Pick title="+ নতুন মাল" onClick={() => { setShowAll(false); setNewItem(true) }} />
          </div>
        </Sheet>
      )}
      {newItem && <NewItemSheet onClose={() => setNewItem(false)} onCreated={(it) => { setNewItem(false); pick(it) }} />}
    </>
  )

  if (sub === 'item' || sub === 'retItem') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{sub === 'item' ? t('কী মাল?') : t('কী মাল ফেরত এল?')}</h2>
          {itemChips(sub === 'item' ? startItem : startRet)}
        </div>
        <div className="actionbar"><button className="btn ghost" style={{ flex: 1 }} onClick={() => setSub('ask')}>{t('ফিরে')}</button></div>
      </>
    )
  }

  if (sub === 'qty' && cur) {
    const it = itemOf(cur.item_id)
    return (
      <>
        <div className="scroll">
          <h2 className="question">{tf('{0} কত {1}?', t(it?.name_bn || ''), t(it?.unit_bn || ''))}</h2>
          <MoneyPad value={qty} onChange={setQty} prefix="" allowDecimal chips={qtyChips(s.entries, cur.item_id)} onChipTaken={() => noteChip(true)} />
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSub('item')}>{t('ফিরে')}</button>
          <button className="btn primary" disabled={!Number(qty)} onClick={() => setSub('rate')}>{t('এগিয়ে যান')}</button>
        </div>
      </>
    )
  }

  if (sub === 'rate' && cur) {
    const it = itemOf(cur.item_id)
    const last = lastPurchase(s.entries, cur.item_id)
    const rateNum = Number(rate) || 0
    const q = Number(qty) || 0
    const rise = last && rateNum > last.rate * 1.05
    const name = isEn() ? t(it?.name_bn || '') : ofBn(it?.name_bn || '')
    return (
      <>
        <div className="scroll">
          <h2 className="question">{tf('{0} দর কত?', name)}</h2>
          <p className="hint">{last ? tf('গতবার {0}, {1}', money(last.rate), dayLabelBn(last.date)) : t('প্রথমবার — যা দিলেন লিখুন।')}</p>
          <MoneyPad value={rate} onChange={setRate} allowDecimal />
          {rateNum > 0 && (
            <div className="card" style={{ marginTop: '.9rem' }}>
              <div className="spread"><span>{num(q, q % 1 ? 2 : 0)} {t(it?.unit_bn || '')} × {money(rateNum)}</span>
                <strong className="num">{money(q * rateNum)}</strong></div>
              {rise && <p className="small" style={{ color: 'var(--warn)', marginTop: '.4rem' }}>
                {tf('গতবারের থেকে {0}% বেশি।', toBn(Math.round(((rateNum - last!.rate) / last!.rate) * 100)))}</p>}
            </div>
          )}
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSub('qty')}>{t('ফিরে')}</button>
          <button className="btn primary" disabled={!rateNum} onClick={() => setSub('who')}>{t('এগিয়ে যান')}</button>
        </div>
      </>
    )
  }

  if (sub === 'who' && cur) {
    return (
      <WhoPaid s={s} itemId={cur.item_id} date={date} defaultParty={cur.party_id} onBack={() => setSub('rate')}
        onDone={(paid, party_id, photo_id, days) => {
          setList([...list, { ...cur, qty: Number(qty) || 0, rate: Number(rate) || 0, paid, party_id, due_date: paid ? '' : dueFrom(date, days), photo_id }])
          setCur(null); setSub('ask')
        }} />
    )
  }

  if (sub === 'retQty' && ret && setRets) {
    const it = itemOf(ret.item_id)
    return (
      <>
        <div className="scroll">
          <h2 className="question">{tf('{0} কত {1} ফেরত?', t(it?.name_bn || ''), t(it?.unit_bn || ''))}</h2>
          <MoneyPad value={qty} onChange={setQty} prefix="" allowDecimal />
          <Field label="কোন দরে (ফেরত)"><NumField value={ret.rate || null} onChange={(v) => setRet({ ...ret, rate: v ?? 0 })} decimal /></Field>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSub('retItem')}>{t('ফিরে')}</button>
          <button className="btn primary" disabled={!Number(qty)}
            onClick={() => { setRets([...(rets ?? []), { key: uid(), item_id: ret.item_id, qty: Number(qty) || 0, rate: ret.rate }]); setRet(null); setSub('ask') }}>{t('যোগ করুন')}</button>
        </div>
      </>
    )
  }

  /* the question itself, and what has been written so far */
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t(question)}</h2>
        {hasLines && (
          <div className="card" style={{ marginBottom: '.9rem' }}>
            {list.map((m) => (
              <div key={m.key} className="review-row">
                <span>
                  <span className="t">{nameOf(s, m.item_id)}</span>
                  <span className="k">{num(m.qty, m.qty % 1 ? 2 : 0)} {t(itemOf(m.item_id)?.unit_bn || '')} × {money(m.rate)}{m.paid ? '' : t(' · বাকি')}</span>
                </span>
                <span className="v num">{money(m.qty * m.rate)}</span>
                <button className="iconbtn" onClick={() => setList(list.filter((x) => x.key !== m.key))} aria-label={t('বাদ দিন')}><Icon name="trash" size={18} /></button>
              </div>
            ))}
            {(rets ?? []).map((r) => (
              <div key={r.key} className="review-row">
                <span>
                  <span className="t">{nameOf(s, r.item_id)}</span>
                  <span className="k">{t('ফেরত')} · {num(r.qty, r.qty % 1 ? 2 : 0)} {t(itemOf(r.item_id)?.unit_bn || '')} × {money(r.rate)}</span>
                </span>
                <span className="v num">−{money(r.qty * r.rate)}</span>
                <button className="iconbtn" onClick={() => setRets?.((rets ?? []).filter((x) => x.key !== r.key))} aria-label={t('বাদ দিন')}><Icon name="trash" size={18} /></button>
              </div>
            ))}
            <div className="total"><span className="k">{t('মোট')}</span><span className="v num">{money(total)}</span></div>
          </div>
        )}
        {hasLines
          ? <button className="btn quiet" style={{ width: '100%' }} onClick={() => setSub('item')}>{t('আরও মাল')}</button>
          : (
            <div className="yesno">
              <button onClick={next}>{t('না')}</button>
              <button className="on" onClick={() => setSub('item')}>{t('হ্যাঁ')}</button>
            </div>
          )}
        {setRets && (
          <button className="btn quiet small" style={{ marginTop: '1.2rem' }} onClick={() => setSub('retItem')}>{t('সাইট থেকে মাল ফেরত এল?')}</button>
        )}
      </div>
      {hasLines && <div className="actionbar"><button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button></div>}
    </>
  )
}

/* কার থেকে নিলেন? and টাকা দিয়েছেন? — on a screen of their own, after the price. */
function WhoPaid({ s, itemId, date, defaultParty, onBack, onDone }: {
  s: State; itemId: ID; date: string; defaultParty: ID | ''
  onBack: () => void; onDone: (paid: boolean, party: ID | '', photo: ID | '', days: number) => void
}) {
  const [party, setPartyRaw] = useState<ID | ''>(defaultParty)
  const [dueDays, setDueDays] = useState<number | null>(null)
  const setParty = (id: ID | '') => { setPartyRaw(id); setDueDays(null) }
  const [paid, setPaid] = useState<boolean | null>(null)
  const [photo, setPhoto] = useState<ID | ''>('')
  const [allParties, setAllParties] = useState(false)
  const [newParty, setNewParty] = useState(false)
  const suppliers = parties(s).filter((p) => p.ptype === 'supplier')
  const ranked = useMemo(() => rankParties(s.entries, itemId), [s.entries, itemId])
  const top = pad(ranked.map((id) => suppliers.find((p) => p.id === id)!).filter(Boolean), suppliers, 3)
  const rest = suppliers.filter((p) => !top.some((x) => x.id === p.id))
  const partyObj = suppliers.find((p) => p.id === party)

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('কার থেকে নিলেন?')}</h2>
        <div className="chips">
          {top.map((p) => <Chip key={p.id} on={party === p.id} onClick={() => setParty(party === p.id ? '' : p.id)}>{p.name_bn}</Chip>)}
          {rest.length > 0 && <Chip onClick={() => setAllParties(true)}>{t('আরও…')}</Chip>}
          <Chip onClick={() => setNewParty(true)}>{t('+ নতুন দোকান')}</Chip>
        </div>

        <p className="sectionlabel">{t('টাকা দিয়েছেন?')}</p>
        <div className="yesno">
          <button className={paid === true ? 'on' : ''} onClick={() => setPaid(true)}>{t('হ্যাঁ, দিয়েছি')}</button>
          <button className={paid === false ? 'on' : ''} onClick={() => setPaid(false)}>{t('না, বাকি')}</button>
        </div>
        {paid === false && !party && (
          <p className="small" style={{ marginTop: '.5rem', color: 'var(--warn)' }}>{t('বাকিতে কিনলে দোকানের নাম দিন।')}</p>
        )}
        {paid === false && (
          <DueChips question="কবে দেবেন?" days={dueDays ?? defaultDueDays(partyObj?.terms_days ?? 0)} onChange={setDueDays} own={partyObj?.terms_days} from={date} />
        )}

        <button className="btn quiet small" style={{ marginTop: '1rem' }}
          onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon name="camera" size={18} />{photo ? t('বিলের ছবি নেওয়া হয়েছে') : t('বিলের ছবি তুলুন (ইচ্ছে হলে)')}
          </span>
        </button>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={onBack}>{t('ফিরে')}</button>
        <button className="btn primary" disabled={paid === null || (paid === false && !party)}
          onClick={() => onDone(paid === true, party, photo, dueDays ?? defaultDueDays(partyObj?.terms_days ?? 0))}>{t('যোগ করুন')}</button>
      </div>
      {allParties && (
        <Sheet title="সব দোকান" onClose={() => setAllParties(false)}>
          <div className="rowlist">
            {suppliers.map((p) => <Pick key={p.id} title={p.name_bn} sub={p.terms_days ? tf('{0} দিনের বাকি', toBn(p.terms_days)) : undefined} onClick={() => { setParty(p.id); setAllParties(false) }} />)}
            <Pick title="+ নতুন দোকান" onClick={() => { setAllParties(false); setNewParty(true) }} />
          </div>
        </Sheet>
      )}
      {newParty && <NewPartySheet onClose={() => setNewParty(false)} onCreated={(p) => { setParty(p.id); setNewParty(false) }} />}
    </>
  )
}
