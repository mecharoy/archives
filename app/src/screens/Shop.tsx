import { useMemo, useState } from 'react'
import { Icon, TopBar, Pick, Chip, Sheet, MoneyPad, useToast, Toast, Empty } from '../ui/kit'
import { NewItemSheet, NewPartySheet } from './DayWizard'
import { useStore, items, parties, activeProjects, saveEntries, saveMaster, nameOf, noteChip, type State } from '../lib/store'
import { uid } from '../lib/db'
import { money, toBn, num, isoDate, addDays, dateBn } from '../lib/bn'
import type { Item, StockEntry, ID } from '../lib/model'
import { shopStock, duesSplit } from '../lib/calc'
import { rankItems, rankParties, lastPurchase, qtyChips } from '../lib/suggest'
import { scheduleSync } from '../lib/sync'
import { capture } from '../lib/photo'
import { t, tf } from '../lib/i18n'

type Flow = null | 'in' | 'sale' | 'count' | 'transfer'

export function Shop({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [flow, setFlow] = useState<Flow>(null)
  const toast = useToast()
  const levels = useMemo(() => shopStock(s.entries, items(s)), [s.entries, s.masters])
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const value = levels.reduce((a, l) => a + l.value, 0)

  if (flow) return <StockFlow s={s} flow={flow} onDone={(msg) => { setFlow(null); if (msg) toast.show(msg) }} />

  return (
    <>
      <TopBar title="দোকানের মজুত" sub={tf('{0} রকম মাল · {1}', toBn(levels.length), money(value))} onBack={onBack} />
      <div className="scroll">
        <div className="tilegrid" style={{ marginTop: '1rem' }}>
          <button className="tile" onClick={() => setFlow('in')}>
            <Icon name="plus" size={22} /><span><span className="t" style={{ display: 'block' }}>{t("মাল এসেছে")}</span><span className="s">{t("দোকানে ঢুকল")}</span></span>
          </button>
          <button className="tile" onClick={() => setFlow('sale')}>
            <Icon name="shop" size={22} stroke={1.6} /><span><span className="t" style={{ display: 'block' }}>{t("বিক্রি হয়েছে")}</span><span className="s">{t("খদ্দেরকে")}</span></span>
          </button>
          <button className="tile" onClick={() => setFlow('transfer')}>
            <Icon name="fwd" size={22} /><span><span className="t" style={{ display: 'block' }}>{t("কাজে পাঠানো")}</span><span className="s">{t("দামে নয়, খরচে")}</span></span>
          </button>
          <button className="tile" onClick={() => setFlow('count')}>
            <Icon name="check" size={22} /><span><span className="t" style={{ display: 'block' }}>{t("মাল গোনা")}</span><span className="s">{t("যা আছে মিলিয়ে নিন")}</span></span>
          </button>
        </div>

        {dues.total > 0 && (
          <>
            <p className="sectionlabel">{t("দোকানে বাকি")}</p>
            <div className="card">
              {dues.all.slice(0, 8).map((d) => (
                <div className="review-row" key={d.entry_id}>
                  <span>
                    <span className="t">{d.party_id ? nameOf(s, d.party_id) : t('নাম লেখা নেই')}</span>
                    <span className="k">{nameOf(s, d.item_id)} · {d.due_date < isoDate() ? t('সময় পেরিয়েছে') : tf('{0} তারিখে', dateBn(d.due_date, false))}</span>
                  </span>
                  <span className="v num" style={{ color: d.due_date < isoDate() ? 'var(--crit)' : undefined }}>{money(d.amount)}</span>
                </div>
              ))}
              <div className="total"><span className="k">{t("মোট বাকি")}</span><span className="v num">{money(dues.total)}</span></div>
            </div>
          </>
        )}

        <p className="sectionlabel">{t("এখন যা আছে")}</p>
        {levels.length === 0 && <Empty>{t("এখনও কোনো মাল ঢোকেনি।")}<br />{t("‘মাল এসেছে’ থেকে শুরু করুন।")}</Empty>}
        {levels.length > 0 && (
          <div className="card">
            {levels.map((l) => (
              <div className="review-row" key={l.item_id}>
                <span>
                  <span className="t">{nameOf(s, l.item_id)}</span>
                  <span className="k">{tf('{0} দরে', money(l.rate))}</span>
                </span>
                <span className="v num" style={{ color: l.qty < 0 ? 'var(--crit)' : undefined }}>
                  {num(l.qty, l.qty % 1 ? 2 : 0)} {items(s).find((i) => i.id === l.item_id)?.unit_bn}
                </span>
              </div>
            ))}
            <div className="total"><span className="k">{t("মজুতের দাম")}</span><span className="v num">{money(value)}</span></div>
          </div>
        )}
      </div>
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function padChips<T extends { id: ID }>(ranked: T[], all: T[], n: number): T[] {
  const out = ranked.slice(0, n)
  for (const x of all) {
    if (out.length >= n) break
    if (!out.some((y) => y.id === x.id)) out.push(x)
  }
  return out
}

const TITLES: Record<Exclude<Flow, null>, string> = {
  in: 'মাল এসেছে', sale: 'বিক্রি হয়েছে', transfer: 'কাজে পাঠানো', count: 'মাল গোনা',
}

function StockFlow({ s, flow, onDone }: { s: State; flow: Exclude<Flow, null>; onDone: (msg?: string) => void }) {
  const [step, setStep] = useState<'item' | 'qty' | 'rate' | 'who'>('item')
  const [item, setItem] = useState<Item | null>(null)
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [party, setParty] = useState<ID | ''>('')
  const [project, setProject] = useState<ID | ''>('')
  const [paid, setPaid] = useState<boolean | null>(null)
  const [photo, setPhoto] = useState<ID | ''>('')
  /* Goods do not always get written down the moment they move — a sale at
     four o'clock can be entered after the shutters are down, and a delivery
     that came yesterday is still yesterday's. Today is the default; the row
     also keeps the clock time it was written, which is what created_at is. */
  const [date, setDate] = useState(isoDate())
  const [showAll, setShowAll] = useState(false)
  const [newItem, setNewItem] = useState(false)
  const [newParty, setNewParty] = useState(false)

  const all = items(s)
  const ranked = rankItems(s.entries, '')
  const top = padChips(ranked.map((id) => all.find((x) => x.id === id)!).filter(Boolean), all, 3)
  const levels = shopStock(s.entries, all)
  const held = item ? levels.find((l) => l.item_id === item.id)?.qty ?? 0 : 0
  const kind = flow === 'sale' ? 'client' : 'supplier'
  const list = parties(s).filter((p) => p.ptype === kind)
  const rankedParties = rankParties(s.entries, item?.id)
  const topParties = kind === 'supplier'
    ? padChips(rankedParties.map((id) => list.find((p) => p.id === id)!).filter(Boolean), list, 3)
    : list.slice(0, 3)

  const start = (it: Item) => {
    const lp = lastPurchase(s.entries, it.id)
    setItem(it)
    setQty('')
    setRate(flow === 'count' ? '' : String(lp?.rate ?? it.last_rate ?? ''))
    setParty(flow === 'in' ? lp?.party_id ?? '' : '')
    setStep(flow === 'count' ? 'qty' : 'qty')
  }

  const commit = async () => {
    if (!item) return
    const q = Number(qty) || 0
    const r = Number(rate) || 0
    const p = list.find((x) => x.id === party)
    const credit = (flow === 'in' || flow === 'sale') && paid === false
    const e: StockEntry = {
      id: uid(), kind: 'stock', batch: uid(), date,
      project_id: flow === 'transfer' ? project : '', created_at: new Date().toISOString(),
      item_id: item.id, dir: flow, qty: q, rate: r, amount: Math.round(q * r * 100) / 100,
      party_id: flow === 'transfer' ? '' : party,
      due_date: credit ? addDays(date, p?.terms_days ?? 0) : '',
      paid: flow === 'in' || flow === 'sale' ? paid !== false : true, photo_id: photo,
    }
    await saveEntries([e])
    if (flow === 'in' && r > 0) await saveMaster({ ...item, last_rate: r })
    scheduleSync(300)
    onDone(`${t(item.name_bn)} — ${t(TITLES[flow])}`)
  }

  const unit = item?.unit_bn || ''

  return (
    <>
      <TopBar title={TITLES[flow]} sub={item?.name_bn} onBack={() => (step === 'item' ? onDone() : setStep(step === 'qty' ? 'item' : step === 'rate' ? 'qty' : 'rate'))} />
      {step === 'item' && (
        <>
          <div className="scroll">
            <h2 className="question">{t("কোন মাল?")}</h2>
            <div className="chips">
              {top.map((it) => <Chip key={it.id} onClick={() => { noteChip(true); start(it) }}>{it.name_bn}</Chip>)}
              {all.length > top.length && <Chip onClick={() => { noteChip(false); setShowAll(true) }}>{t("আরও…")}</Chip>}
              {all.length === 0 && <Chip onClick={() => setNewItem(true)}>{t("+ নতুন মাল")}</Chip>}
            </div>
          </div>
          {showAll && (
            <Sheet title="সব মাল" onClose={() => setShowAll(false)}>
              <div className="rowlist">
                {all.map((it) => <Pick key={it.id} title={it.name_bn} sub={it.unit_bn} onClick={() => { setShowAll(false); start(it) }} />)}
                <Pick title="+ নতুন মাল" onClick={() => { setShowAll(false); setNewItem(true) }} />
              </div>
            </Sheet>
          )}
          {newItem && <NewItemSheet onClose={() => setNewItem(false)} onCreated={(it) => { setNewItem(false); start(it) }} />}
        </>
      )}

      {step === 'qty' && item && (
        <>
          <div className="scroll">
            <h2 className="question">
              {flow === 'count' ? tf('{0} গুনে কত {1}?', item.name_bn, unit) : tf('কত {0}?', unit)}
            </h2>
            {flow !== 'in' && <p className="hint">{tf('দোকানে আছে {0} {1}', num(held, held % 1 ? 2 : 0), t(unit))}</p>}
            <MoneyPad value={qty} onChange={setQty} prefix="" allowDecimal chips={qtyChips(s.entries, item.id)} onChipTaken={() => noteChip(true)} />
            {flow !== 'in' && flow !== 'count' && Number(qty) > held && (
              <div className="alert warn" style={{ marginTop: '.8rem' }}>
                <span className="dot" /><span>{t("দোকানে এত নেই। মজুত মাইনাসে চলে যাবে — আগে ‘মাল গোনা’ করে নিন।")}</span>
              </div>
            )}
          </div>
          <div className="actionbar">
            <button className="btn primary" disabled={!Number(qty)}
              onClick={() => setStep(flow === 'count' ? 'who' : 'rate')}>{t("এগিয়ে যান")}</button>
          </div>
        </>
      )}

      {step === 'rate' && item && (
        <>
          <div className="scroll">
            <h2 className="question">{flow === 'sale' ? t('কত দরে বিক্রি?') : flow === 'transfer' ? t('কোন দামে ধরব?') : t('কত দর?')}</h2>
            <p className="hint">
              {flow === 'transfer'
                ? t('কাজে পাঠানো মাল কেনা দামেই ধরা হয় — তাতে দোকানের লাভ আর কাজের খরচ, দুটোই ঠিক থাকে।')
                : lastPurchase(s.entries, item.id)
                  ? tf('গতবার {0} প্রতি {1}', money(lastPurchase(s.entries, item.id)!.rate), unit)
                  : t('প্রথমবার')}
            </p>
            <MoneyPad value={rate} onChange={setRate} allowDecimal />
            <div className="card" style={{ marginTop: '.9rem' }}>
              <div className="spread"><span>{num(Number(qty), 2)} {unit} × {money(Number(rate) || 0)}</span>
                <strong className="num">{money((Number(qty) || 0) * (Number(rate) || 0))}</strong></div>
            </div>
          </div>
          <div className="actionbar">
            <button className="btn primary" disabled={!Number(rate)} onClick={() => setStep('who')}>{t("এগিয়ে যান")}</button>
          </div>
        </>
      )}

      {step === 'who' && item && (
        <>
          <div className="scroll">
            {flow === 'transfer' ? (
              <>
                <h2 className="question">{t("কোন কাজে?")}</h2>
                <div className="rowlist">
                  {activeProjects(s).map((p) => (
                    <Pick key={p.id} on={project === p.id} title={p.name_bn} onClick={() => setProject(p.id)} />
                  ))}
                </div>
              </>
            ) : flow === 'count' ? (
              <>
                <h2 className="question">{t("মিলিয়ে নিন")}</h2>
                <div className="card">
                  <div className="review-row"><span className="t">{t("খাতায় ছিল")}</span><span className="v num">{num(held, 2)} {unit}</span></div>
                  <div className="review-row"><span className="t">{t("গুনে পাওয়া গেল")}</span><span className="v num">{num(Number(qty), 2)} {unit}</span></div>
                  <div className="total">
                    <span className="k">{t("ফারাক")}</span>
                    <span className="v num" style={{ color: Math.abs(Number(qty) - held) > 0.01 ? 'var(--warn)' : undefined }}>
                      {num(Number(qty) - held, 2)} {unit}
                    </span>
                  </div>
                </div>
                <p className="hint" style={{ marginTop: '.9rem' }}>{t("সেভ করলে আজ থেকে এই সংখ্যাটাই ধরা হবে।")}</p>
              </>
            ) : (
              <>
                <h2 className="question">{flow === 'sale' ? t('কাকে বিক্রি?') : t('কার কাছ থেকে?')}</h2>
                <div className="chips">
                  {topParties.map((p) => <Chip key={p.id} on={party === p.id} onClick={() => setParty(p.id)}>{p.name_bn}</Chip>)}
                  <Chip onClick={() => setNewParty(true)}>{t("+ নতুন")}</Chip>
                  {flow === 'sale' && <Chip on={party === ''} onClick={() => setParty('')}>{t("খুচরো খদ্দের")}</Chip>}
                </div>
                {(flow === 'in' || flow === 'sale') && (
                  <>
                    <p className="sectionlabel">{flow === 'sale' ? t('টাকা পেয়েছেন?') : t('টাকা দিয়েছেন?')}</p>
                    <div className="yesno">
                      <button className={paid === true ? 'on' : ''} onClick={() => setPaid(true)}>{t("হ্যাঁ")}</button>
                      <button className={paid === false ? 'on' : ''} onClick={() => setPaid(false)}>{t("না, বাকি")}</button>
                    </div>
                    {paid === false && flow === 'sale' && !party && (
                      <p className="small muted" style={{ marginTop: '.5rem' }}>
                        {t('বাকিতে বিক্রি হলে খদ্দেরের নাম দিন — নইলে কার কাছে পাওনা তা আর মনে থাকবে না।')}
                      </p>
                    )}
                    <button className="btn quiet small" style={{ marginTop: '1rem' }}
                      onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                        <Icon name="camera" size={18} />{photo ? t('বিলের ছবি নেওয়া হয়েছে') : t('বিলের ছবি')}
                      </span>
                    </button>
                  </>
                )}
              </>
            )}

            <div className="divider" />
            <p className="sectionlabel" style={{ marginTop: 0 }}>{t("কবেকার হিসাব?")}</p>
            <div className="chips">
              <Chip on={date === isoDate()} onClick={() => setDate(isoDate())}>{t('আজ')}</Chip>
              <Chip on={date === addDays(isoDate(), -1)} onClick={() => setDate(addDays(isoDate(), -1))}>{t('গতকাল')}</Chip>
            </div>
            <input className="input" type="date" value={date} max={isoDate()} style={{ marginTop: '.6rem' }}
              onChange={(e) => e.target.value && setDate(e.target.value)} />
            <p className="small muted" style={{ marginTop: '.4rem' }}>
              {tf('লেখা হচ্ছে {0} · এখনকার সময় ধরে রাখা হবে', dateBn(date, false))}
            </p>
          </div>
          <div className="actionbar">
            <button className="btn primary"
              disabled={((flow === 'in' || flow === 'sale') && paid === null) || (flow === 'transfer' && !project)}
              onClick={commit}>{t("সেভ করুন")}</button>
          </div>
          {newParty && <NewPartySheet kind={kind} onClose={() => setNewParty(false)} onCreated={(p) => { setParty(p.id); setNewParty(false) }} />}
        </>
      )}
    </>
  )
}

export function shopStockAt(s: State) {
  return shopStock(s.entries, items(s))
}
