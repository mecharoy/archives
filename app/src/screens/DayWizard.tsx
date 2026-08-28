import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, CheckPick, Pick, Chip, Sheet, MoneyPad, Field, NumField, useToast, Toast } from '../ui/kit'
import { useStore, getState, activeProjects, workers, items, parties, stages, saveEntries, saveMaster, noteChip, nameOf, type State } from '../lib/store'
import { uid } from '../lib/db'
import { money, toBn, dayLabelBn, dateBn, isoDate, addDays, num } from '../lib/bn'
import { MONEY_HEADS_SITE, PAY_MODES, type ID, type Presence, type Item, type Party } from '../lib/model'
import { DAYS_FOR, newDraft, loadDraft, saveDraft, clearDraft, buildEntries, wageTotal, matTotal, expTotal, dayTotal, draftIsEmpty, type Draft, type DraftMat, type DraftExp } from '../lib/draft'
import { lastAttendance, rankItems, rankHeads, rankParties, lastPurchase, qtyChips, amountChips, screenDemoted, rankProjects } from '../lib/suggest'
import { cashState, currentStage } from '../lib/calc'
import { capture } from '../lib/photo'
import { scheduleSync } from '../lib/sync'

type StepId = 'project' | 'attendance' | 'wages' | 'material' | 'expense' | 'progress' | 'cash' | 'review'

const QUESTION: Record<StepId, string> = {
  project: 'কোন কাজ?',
  attendance: 'আজ কে কে এসেছে?',
  wages: 'মজুরি কত দিলেন?',
  material: 'মাল এসেছে?',
  expense: 'আর কোনো খরচ?',
  progress: 'কাজ কতদূর?',
  cash: 'দিনের শেষে হাতে কত?',
  review: 'একবার দেখে নিন',
}

export function DayWizard({ start, onExit }: { start: Draft | null; onExit: (saved: boolean) => void }) {
  const s = useStore((x) => x)
  const [draft, setDraft] = useState<Draft | null>(start)
  const [i, setI] = useState(start?.step ?? 0)
  const [showExtras, setShowExtras] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (draft) return
    void (async () => {
      // A half-finished day is resumed whatever date it carries — he may be
      // finishing yesterday's entry this morning, and dropping it would be the
      // one bug that loses work he already typed.
      const saved = await loadDraft()
      const resume = saved && (saved.date === isoDate() || !draftIsEmpty(saved))
      const d = resume ? saved : newDraft()
      const act = activeProjects(getState())
      if (!d.project_id && act.length === 1) d.project_id = act[0].id
      setDraft(d)
      setI(resume ? saved.step : 0)
    })()
  }, [draft])

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => {
      if (!d) return d
      const next = { ...d, ...p }
      void saveDraft(next)
      return next
    })
  }

  const demoted = useMemo(() => {
    if (!draft?.project_id) return { material: false, expense: false, progress: false }
    return {
      material: screenDemoted(s.entries, 'material', draft.project_id),
      expense: screenDemoted(s.entries, 'expense', draft.project_id),
      progress: screenDemoted(s.entries, 'progress', draft.project_id),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.project_id])

  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = []
    if (activeProjects(s).length > 1) list.push('project')
    list.push('attendance', 'wages')
    if (!demoted.material || showExtras || (draft?.mats.length ?? 0) > 0) list.push('material')
    if (!demoted.expense || showExtras || (draft?.exps.length ?? 0) > 0) list.push('expense')
    if (!demoted.progress || showExtras || draft?.progress) list.push('progress')
    list.push('cash', 'review')
    return list
  }, [s, demoted, showExtras, draft?.mats.length, draft?.exps.length, draft?.progress])

  useEffect(() => { if (draft && draft.step !== i) patch({ step: i }) }, [i]) // eslint-disable-line
  useEffect(() => { if (i > steps.length - 1) setI(steps.length - 1) }, [steps.length]) // eslint-disable-line

  if (!draft) return null
  const step = steps[Math.min(i, steps.length - 1)]
  const back = () => (i > 0 ? setI(i - 1) : onExit(false))
  const next = () => setI(Math.min(i + 1, steps.length - 1))
  const jumpTo = (id: StepId) => { const k = steps.indexOf(id); if (k >= 0) setI(k) }

  const save = async () => {
    const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
    const withComputed = { ...draft, cash_computed: cash.computed }
    await saveEntries(buildEntries(withComputed))
    // Keep the item master's rate current, so the estimator and the shop see
    // the same price he just paid on site.
    for (const m of draft.mats) {
      const it = items(s).find((x) => x.id === m.item_id)
      if (it && m.rate > 0 && it.last_rate !== m.rate) await saveMaster({ ...it, last_rate: m.rate })
    }
    await clearDraft()
    scheduleSync(300)
    onExit(true)
  }

  const project = activeProjects(s).find((p) => p.id === draft.project_id)

  return (
    <>
      <div className="wizhead">
        <button className="iconbtn" onClick={back} aria-label="আগের ধাপ"><Icon name="back" /></button>
        <div className="stepdots">
          {steps.map((sid, k) => <i key={sid} className={k <= i ? 'on' : ''} />)}
        </div>
        <span className="stepcount num">{toBn(i + 1)} / {toBn(steps.length)}</span>
        <button className="iconbtn" onClick={() => onExit(false)} aria-label="বন্ধ করুন"><Icon name="close" /></button>
      </div>

      {step === 'project' && <StepProject s={s} draft={draft} patch={patch} next={next} />}
      {step === 'attendance' && <StepAttendance s={s} draft={draft} patch={patch} next={next} />}
      {step === 'wages' && <StepWages s={s} draft={draft} patch={patch} next={next} />}
      {step === 'material' && <StepMaterial s={s} draft={draft} patch={patch} next={next} />}
      {step === 'expense' && <StepExpense s={s} draft={draft} patch={patch} next={next} />}
      {step === 'progress' && <StepProgress s={s} draft={draft} patch={patch} next={next} />}
      {step === 'cash' && <StepCash s={s} draft={draft} patch={patch} next={next} />}
      {step === 'review' && (
        <StepReview
          s={s} draft={draft} project_bn={project?.name_bn || ''} onJump={jumpTo} onSave={save}
          extrasAvailable={!showExtras && (demoted.material || demoted.expense || demoted.progress)}
          onExtras={() => { setShowExtras(true); toast.show('বাকি প্রশ্নগুলো যোগ করা হল') }}
          patch={patch}
        />
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* ---------- 1. project ---------- */

function StepProject({ s, draft, patch, next }: StepProps) {
  const list = useMemo(() => {
    const act = activeProjects(s)
    const order = rankProjects(s.entries, act.map((p) => p.id))
    return order.map((id) => act.find((p) => p.id === id)!).filter(Boolean)
  }, [s])
  return (
    <>
      <div className="scroll">
        <h2 className="question">{QUESTION.project}</h2>
        <p className="hint">{dateBn(draft.date)}</p>
        <div className="rowlist">
          {list.map((p) => (
            <Pick key={p.id} on={draft.project_id === p.id}
              title={p.name_bn} sub={p.client_bn || undefined}
              right={<Icon name="fwd" size={18} />}
              onClick={() => { patch({ project_id: p.id }); next() }} />
          ))}
        </div>
      </div>
    </>
  )
}

/* ---------- 2. attendance ---------- */

function StepAttendance({ s, draft, patch, next }: StepProps) {
  const men = workers(s)
  const suggested = useMemo(() => lastAttendance(s.entries, draft.project_id), [s.entries, draft.project_id])
  const [seeded, setSeeded] = useState(false)
  const [longPress, setLongPress] = useState<ID | null>(null)

  useEffect(() => {
    if (seeded || Object.keys(draft.att).length || !suggested.size) { setSeeded(true); return }
    const att: Draft['att'] = {}
    for (const [wid, presence] of suggested) {
      const w = men.find((x) => x.id === wid)
      if (!w) continue
      att[wid] = { presence, rate: w.rate, amount: w.rate * DAYS_FOR[presence], advance: 0 }
    }
    patch({ att })
    setSeeded(true)
  }, [seeded, suggested, men]) // eslint-disable-line

  const toggle = (wid: ID) => {
    const att = { ...draft.att }
    if (att[wid]) delete att[wid]
    else {
      const w = men.find((x) => x.id === wid)!
      att[wid] = { presence: 'full', rate: w.rate, amount: w.rate, advance: 0 }
    }
    patch({ att })
  }

  const setPresence = (wid: ID, presence: Presence) => {
    const w = men.find((x) => x.id === wid)!
    const prev = draft.att[wid]
    patch({ att: { ...draft.att, [wid]: { presence, rate: prev?.rate ?? w.rate, amount: (prev?.rate ?? w.rate) * DAYS_FOR[presence], advance: prev?.advance ?? 0 } } })
    setLongPress(null)
  }

  const count = Object.keys(draft.att).length
  const hold = useHold((wid) => men.some((m) => m.id === wid) && setLongPress(wid))

  return (
    <>
      <div className="scroll">
        <h2 className="question">{QUESTION.attendance}</h2>
        <p className="hint">
          {suggested.size ? 'গতবারের মতো টিক দেওয়া আছে। যে আসেনি তার টিক তুলে দিন।' : 'যারা এসেছে তাদের টিক দিন।'}
          {' '}আধা দিন বা ওভারটাইম দিতে নামের উপর চেপে ধরুন।
        </p>
        {men.length === 0 && <p className="hint">কোনো লোক যোগ করা নেই। সেটিংস থেকে লোক যোগ করুন।</p>}
        <div className="rowlist">
          {men.map((w) => {
            const a = draft.att[w.id]
            return (
              <div key={w.id} {...hold(w.id)}>
                <CheckPick
                  on={!!a}
                  title={w.name_bn}
                  sub={a && a.presence !== 'full' ? (a.presence === 'half' ? 'আধা দিন' : 'ওভারটাইম') : `${money(w.rate)} রোজ`}
                  right={a ? money(a.amount) : ''}
                  onClick={() => toggle(w.id)}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="actionbar">
        <div className="btn ghost" style={{ display: 'grid', placeItems: 'center', minWidth: '6.5rem' }}>
          <span className="num">{toBn(count)} জন</span>
        </div>
        <button className="btn primary" onClick={next}>এগিয়ে যান</button>
      </div>
      {longPress && (
        <Sheet title={nameOf(s, longPress)} onClose={() => setLongPress(null)}>
          <div className="rowlist">
            {(['full', 'half', 'ot'] as Presence[]).map((p) => (
              <Pick key={p} on={draft.att[longPress]?.presence === p}
                title={p === 'full' ? 'পুরো দিন' : p === 'half' ? 'আধা দিন' : 'ওভারটাইম (দেড় দিন)'}
                onClick={() => setPresence(longPress, p)} />
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

function useHold(fn: (id: ID) => void) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (id: ID) => ({
    onPointerDown: () => { t.current = setTimeout(() => { if (navigator.vibrate) navigator.vibrate(14); fn(id) }, 480) },
    onPointerUp: () => { if (t.current) clearTimeout(t.current) },
    onPointerLeave: () => { if (t.current) clearTimeout(t.current) },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
}

/* ---------- 3. wages ---------- */

function StepWages({ s, draft, patch, next }: StepProps) {
  const [editing, setEditing] = useState<ID | null>(null)
  const [amount, setAmount] = useState('')
  const [advance, setAdvance] = useState('')
  const [tab, setTab] = useState<'amount' | 'advance'>('amount')
  const rows = Object.entries(draft.att)

  const open = (wid: ID) => {
    const a = draft.att[wid]
    setAmount(String(a.amount || ''))
    setAdvance(a.advance ? String(a.advance) : '')
    setTab('amount')
    setEditing(wid)
  }
  const commit = () => {
    if (!editing) return
    const a = draft.att[editing]
    patch({ att: { ...draft.att, [editing]: { ...a, amount: Number(amount) || 0, advance: Number(advance) || 0 } } })
    setEditing(null)
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{QUESTION.wages}</h2>
        <p className="hint">রোজ অনুযায়ী হিসাব করা আছে। আলাদা দিলে সেই লাইনে চাপ দিন।</p>
        {rows.length === 0 && <p className="hint">কেউ আসেনি, তাই মজুরি নেই।</p>}
        <div className="card">
          {rows.map(([wid, a]) => (
            <button key={wid} className="review-row" onClick={() => open(wid)}>
              <span>
                <span className="t">{nameOf(s, wid)}</span>
                <span className="k">
                  {toBn(DAYS_FOR[a.presence])} দিন × {money(a.rate)}
                  {a.advance > 0 && ` · অগ্রিম ${money(a.advance)}`}
                </span>
              </span>
              <span className="v num">{money(a.amount + a.advance)}</span>
            </button>
          ))}
          {rows.length > 0 && (
            <div className="total">
              <span className="k">মোট মজুরি</span>
              <span className="v num">{money(wageTotal(draft))}</span>
            </div>
          )}
        </div>
      </div>
      <div className="actionbar"><button className="btn primary" onClick={next}>এগিয়ে যান</button></div>
      {editing && (
        <Sheet title={nameOf(s, editing)} onClose={commit}>
          <div className="chips" style={{ marginBottom: '.6rem' }}>
            <Chip on={tab === 'amount'} onClick={() => setTab('amount')}>মজুরি</Chip>
            <Chip on={tab === 'advance'} onClick={() => setTab('advance')}>অগ্রিম</Chip>
          </div>
          {tab === 'amount'
            ? <MoneyPad value={amount} onChange={setAmount} />
            : <MoneyPad value={advance} onChange={setAdvance} />}
          <button className="btn primary" style={{ marginTop: '.8rem' }} onClick={commit}>ঠিক আছে</button>
        </Sheet>
      )}
    </>
  )
}

/* ---------- 4. material ---------- */

function StepMaterial({ s, draft, patch, next }: StepProps) {
  const [sub, setSub] = useState<'ask' | 'item' | 'qty' | 'rate'>(draft.mats.length ? 'ask' : 'ask')
  const [cur, setCur] = useState<DraftMat | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [newItem, setNewItem] = useState(false)

  const ranked = useMemo(() => rankItems(s.entries, draft.project_id), [s.entries, draft.project_id])
  const all = items(s)
  // Ranked first; before he has any history the list is simply his own items,
  // so the screen is never a single "আরও…" chip on day one.
  const top = pad(ranked.map((id) => all.find((x) => x.id === id)!).filter(Boolean), all, 3)
  const rest = all.filter((x) => !top.some((t) => t.id === x.id))
  const last = cur ? lastPurchase(s.entries, cur.item_id) : null
  const itemOf = (id: ID) => all.find((x) => x.id === id)

  const startItem = (item: Item) => {
    const lp = lastPurchase(s.entries, item.id)
    setCur({ key: uid(), item_id: item.id, qty: 0, rate: lp?.rate ?? item.last_rate ?? 0, party_id: lp?.party_id ?? '', due_date: '', paid: false, photo_id: '' })
    setQty('')
    setRate(String(lp?.rate ?? item.last_rate ?? ''))
    setSub('qty')
  }

  const commitLine = (paid: boolean, party_id: ID | '', photo_id: ID | '') => {
    if (!cur) return
    const p = parties(s).find((x) => x.id === party_id)
    const terms = p?.terms_days ?? 0
    const line: DraftMat = {
      ...cur, qty: Number(qty) || 0, rate: Number(rate) || 0, paid, party_id,
      due_date: paid ? '' : addDays(draft.date, terms), photo_id,
    }
    patch({ mats: [...draft.mats, line] })
    setCur(null); setSub('ask')
  }

  if (sub === 'ask') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{QUESTION.material}</h2>
          <p className="hint">আজ কোনো মাল এলে এখানে লিখুন।</p>
          {draft.mats.length > 0 && (
            <div className="card" style={{ marginBottom: '.9rem' }}>
              {draft.mats.map((m) => (
                <div key={m.key} className="review-row">
                  <span>
                    <span className="t">{nameOf(s, m.item_id)}</span>
                    <span className="k">{num(m.qty, m.qty % 1 ? 2 : 0)} {itemOf(m.item_id)?.unit_bn} × {money(m.rate)}{m.paid ? '' : ' · বাকি'}</span>
                  </span>
                  <span className="v num">{money(m.qty * m.rate)}</span>
                  <button className="iconbtn" onClick={() => patch({ mats: draft.mats.filter((x) => x.key !== m.key) })} aria-label="বাদ দিন">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ))}
              <div className="total"><span className="k">মোট</span><span className="v num">{money(matTotal(draft))}</span></div>
            </div>
          )}
          <div className="yesno">
            <button onClick={next}>না</button>
            <button className="on" onClick={() => setSub('item')}>{draft.mats.length ? 'আরও মাল' : 'হ্যাঁ'}</button>
          </div>
        </div>
        {draft.mats.length > 0 && <div className="actionbar"><button className="btn primary" onClick={next}>এগিয়ে যান</button></div>}
      </>
    )
  }

  if (sub === 'item') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">কী মাল?</h2>
          <p className="hint">যেগুলো বেশি আনেন সেগুলো আগে দেখানো হচ্ছে।</p>
          <div className="chips">
            {top.map((it) => <Chip key={it.id} onClick={() => { noteChip(true); startItem(it) }}>{it.name_bn}</Chip>)}
            {rest.length > 0 && <Chip onClick={() => { noteChip(false); setShowAll(true) }}>আরও…</Chip>}
            {all.length === 0 && <Chip onClick={() => setNewItem(true)}>নতুন মাল যোগ করুন</Chip>}
          </div>
        </div>
        <div className="actionbar"><button className="btn ghost" style={{ flex: 1 }} onClick={() => setSub('ask')}>ফিরে যান</button></div>
        {showAll && (
          <Sheet title="সব মাল" onClose={() => setShowAll(false)}>
            <div className="rowlist">
              {all.map((it) => <Pick key={it.id} title={it.name_bn} sub={it.unit_bn} onClick={() => { setShowAll(false); startItem(it) }} />)}
              <Pick title="+ নতুন মাল" onClick={() => { setShowAll(false); setNewItem(true) }} />
            </div>
          </Sheet>
        )}
        {newItem && <NewItemSheet onClose={() => setNewItem(false)} onCreated={(it) => { setNewItem(false); startItem(it) }} />}
      </>
    )
  }

  if (sub === 'qty' && cur) {
    const it = itemOf(cur.item_id)
    const chips = qtyChips(s.entries, cur.item_id)
    return (
      <>
        <div className="scroll">
          <h2 className="question">{it?.name_bn} কত {it?.unit_bn}?</h2>
          <MoneyPad value={qty} onChange={setQty} prefix="" allowDecimal chips={chips} onChipTaken={() => noteChip(true)} />
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSub('item')}>ফিরে</button>
          <button className="btn primary" disabled={!Number(qty)} onClick={() => setSub('rate')}>এগিয়ে যান</button>
        </div>
      </>
    )
  }

  if (sub === 'rate' && cur) {
    const it = itemOf(cur.item_id)
    return (
      <RateStep
        s={s} item={it} last={last} rate={rate} setRate={setRate}
        qty={Number(qty) || 0} defaultParty={cur.party_id}
        onBack={() => setSub('qty')}
        onDone={commitLine}
      />
    )
  }
  return null
}

function RateStep({ s, item, last, rate, setRate, qty, defaultParty, onBack, onDone }: {
  s: State; item?: Item; last: ReturnType<typeof lastPurchase>; rate: string; setRate: (v: string) => void
  qty: number; defaultParty: ID | ''; onBack: () => void; onDone: (paid: boolean, party: ID | '', photo: ID | '') => void
}) {
  const [party, setParty] = useState<ID | ''>(defaultParty)
  const [paid, setPaid] = useState<boolean | null>(null)
  const [photo, setPhoto] = useState<ID | ''>('')
  const [allParties, setAllParties] = useState(false)
  const [newParty, setNewParty] = useState(false)
  const suppliers = parties(s).filter((p) => p.ptype === 'supplier')
  const ranked = useMemo(() => rankParties(s.entries, item?.id), [s.entries, item?.id])
  const top = pad(ranked.map((id) => suppliers.find((p) => p.id === id)!).filter(Boolean), suppliers, 3)
  const rest = suppliers.filter((p) => !top.some((t) => t.id === p.id))
  const rateNum = Number(rate) || 0
  const partyObj = suppliers.find((p) => p.id === party)
  const rise = last && rateNum > last.rate * 1.05

  return (
    <>
      <div className="scroll">
        <h2 className="question">{item?.name_bn} দর কত?</h2>
        <p className="hint">
          {last ? `গতবার ${money(last.rate)} প্রতি ${item?.unit_bn} · ${dayLabelBn(last.date)}` : 'প্রথমবার — যা দিলেন লিখুন।'}
        </p>
        <MoneyPad value={rate} onChange={setRate} allowDecimal />
        {rateNum > 0 && (
          <div className="card" style={{ marginTop: '.9rem' }}>
            <div className="spread"><span>{num(qty, qty % 1 ? 2 : 0)} {item?.unit_bn} × {money(rateNum)}</span>
              <strong className="num">{money(qty * rateNum)}</strong></div>
            {rise && <p className="small" style={{ color: 'var(--warn)', marginTop: '.4rem' }}>
              গতবারের থেকে {toBn(Math.round(((rateNum - last!.rate) / last!.rate) * 100))}% বেশি।</p>}
          </div>
        )}

        <p className="sectionlabel">কার কাছ থেকে</p>
        <div className="chips">
          {top.map((p) => <Chip key={p.id} on={party === p.id} onClick={() => setParty(p.id)}>{p.name_bn}</Chip>)}
          {rest.length > 0 && <Chip onClick={() => setAllParties(true)}>আরও…</Chip>}
          {suppliers.length === 0 && <Chip onClick={() => setNewParty(true)}>+ দোকান যোগ করুন</Chip>}
        </div>

        <p className="sectionlabel">টাকা দিয়েছেন?</p>
        <div className="yesno">
          <button className={paid === true ? 'on' : ''} onClick={() => setPaid(true)}>হ্যাঁ, দিয়েছি</button>
          <button className={paid === false ? 'on' : ''} onClick={() => setPaid(false)}>না, বাকি</button>
        </div>
        {paid === false && (
          <p className="hint" style={{ marginTop: '.7rem' }}>
            {partyObj?.terms_days
              ? `${partyObj.name_bn} — ${toBn(partyObj.terms_days)} দিনের মধ্যে, অর্থাৎ ${dateBn(addDays(isoDate(), partyObj.terms_days), false)}।`
              : 'হিসাবে বাকি হিসেবে থাকবে।'}
          </p>
        )}

        <button className="btn quiet small" style={{ marginTop: '1rem' }}
          onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon name="camera" size={18} />{photo ? 'বিলের ছবি নেওয়া হয়েছে' : 'বিলের ছবি (ইচ্ছে হলে)'}
          </span>
        </button>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={onBack}>ফিরে</button>
        <button className="btn primary" disabled={!rateNum || paid === null} onClick={() => onDone(paid === true, party, photo)}>যোগ করুন</button>
      </div>
      {allParties && (
        <Sheet title="সব দোকান" onClose={() => setAllParties(false)}>
          <div className="rowlist">
            {suppliers.map((p) => <Pick key={p.id} title={p.name_bn} sub={p.terms_days ? `${toBn(p.terms_days)} দিনের বাকি` : undefined} onClick={() => { setParty(p.id); setAllParties(false) }} />)}
            <Pick title="+ নতুন দোকান" onClick={() => { setAllParties(false); setNewParty(true) }} />
          </div>
        </Sheet>
      )}
      {newParty && <NewPartySheet onClose={() => setNewParty(false)} onCreated={(p) => { setParty(p.id); setNewParty(false) }} />}
    </>
  )
}

/* ---------- 5. other expenses ---------- */

function StepExpense({ s, draft, patch, next }: StepProps) {
  const [sub, setSub] = useState<'ask' | 'head' | 'amount'>('ask')
  const [head, setHead] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState(PAY_MODES[0])
  const [photo, setPhoto] = useState<ID | ''>('')
  const [showAll, setShowAll] = useState(false)

  const ranked = useMemo(() => rankHeads(s.entries, false), [s.entries])
  const ordered = [...ranked, ...MONEY_HEADS_SITE.filter((h) => !ranked.includes(h))]
  const top = ordered.slice(0, 3)
  const chips = useMemo(() => amountChips(s.entries, head, false), [s.entries, head])

  const add = () => {
    const line: DraftExp = { key: uid(), head_bn: head, amount: Number(amount) || 0, mode, note: '', photo_id: photo }
    patch({ exps: [...draft.exps, line] })
    setHead(''); setAmount(''); setPhoto(''); setSub('ask')
  }

  if (sub === 'ask') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{QUESTION.expense}</h2>
          <p className="hint">গাড়ি ভাড়া, মেশিন, চা — মজুরি আর মাল ছাড়া বাকি সব।</p>
          {draft.exps.length > 0 && (
            <div className="card" style={{ marginBottom: '.9rem' }}>
              {draft.exps.map((e) => (
                <div key={e.key} className="review-row">
                  <span><span className="t">{e.head_bn}</span><span className="k">{e.mode}</span></span>
                  <span className="v num">{money(e.amount)}</span>
                  <button className="iconbtn" onClick={() => patch({ exps: draft.exps.filter((x) => x.key !== e.key) })} aria-label="বাদ দিন"><Icon name="trash" size={18} /></button>
                </div>
              ))}
              <div className="total"><span className="k">মোট</span><span className="v num">{money(expTotal(draft))}</span></div>
            </div>
          )}
          <div className="yesno">
            <button onClick={next}>না</button>
            <button className="on" onClick={() => setSub('head')}>{draft.exps.length ? 'আরও খরচ' : 'হ্যাঁ'}</button>
          </div>
        </div>
        {draft.exps.length > 0 && <div className="actionbar"><button className="btn primary" onClick={next}>এগিয়ে যান</button></div>}
      </>
    )
  }

  if (sub === 'head') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">কীসের খরচ?</h2>
          <div className="chips">
            {top.map((h) => <Chip key={h} onClick={() => { noteChip(true); setHead(h); setSub('amount') }}>{h}</Chip>)}
            <Chip onClick={() => { noteChip(false); setShowAll(true) }}>আরও…</Chip>
          </div>
          <p className="hint" style={{ marginTop: '1.1rem' }}>মজুরি এখানে লিখবেন না — সেটা আগের পাতায় হিসাব হয়ে গেছে।</p>
        </div>
        <div className="actionbar"><button className="btn ghost" style={{ flex: 1 }} onClick={() => setSub('ask')}>ফিরে যান</button></div>
        {showAll && (
          <Sheet title="সব খরচের খাত" onClose={() => setShowAll(false)}>
            <div className="rowlist">
              {ordered.map((h) => <Pick key={h} title={h} onClick={() => { setHead(h); setShowAll(false); setSub('amount') }} />)}
            </div>
          </Sheet>
        )}
      </>
    )
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{head} — কত?</h2>
        <MoneyPad value={amount} onChange={setAmount} chips={chips} onChipTaken={() => noteChip(true)} />
        <p className="sectionlabel">কীভাবে দিলেন</p>
        <div className="chips">
          {PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}
        </div>
        <button className="btn quiet small" style={{ marginTop: '1rem' }}
          onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon name="camera" size={18} />{photo ? 'ছবি নেওয়া হয়েছে' : 'বিলের ছবি (ইচ্ছে হলে)'}
          </span>
        </button>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={() => setSub('head')}>ফিরে</button>
        <button className="btn primary" disabled={!Number(amount)} onClick={add}>যোগ করুন</button>
      </div>
    </>
  )
}

/* ---------- 6. progress ---------- */

function StepProgress({ s, draft, patch, next }: StepProps) {
  const project = activeProjects(s).find((p) => p.id === draft.project_id)
  const info = project ? currentStage(project, s.entries, stages(s)) : null
  if (!project || !info?.current) {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{QUESTION.progress}</h2>
          <p className="hint">এই কাজের ধাপগুলো এখনও ঠিক করা হয়নি। সেটিংস → ধাপ থেকে একবার ঠিক করে নিলে এখানে কাজের অগ্রগতি নিজে থেকেই হিসাব হবে।</p>
        </div>
        <div className="actionbar"><button className="btn primary" onClick={next}>এগিয়ে যান</button></div>
      </>
    )
  }
  const cur = info.current
  const chosen = draft.progress?.stage_seq === cur.seq ? draft.progress.state : info.isHalf ? 'half' : null
  return (
    <>
      <div className="scroll">
        <h2 className="question">{QUESTION.progress}</h2>
        <p className="hint">এখন চলছে — <strong>{cur.name_bn}</strong>{info.next ? ` · এরপর ${info.next.name_bn}` : ''}</p>
        <div className="rowlist">
          <Pick on={chosen === null && !draft.progress} title="এখনও চলছে" sub="আজ আলাদা কিছু হয়নি"
            onClick={() => { patch({ progress: null }); next() }} />
          <Pick on={chosen === 'half'} title={`${cur.name_bn} — অর্ধেক হয়েছে`}
            onClick={() => { patch({ progress: { stage_seq: cur.seq, state: 'half' } }); next() }} />
          <Pick on={chosen === 'done'} title={`${cur.name_bn} — শেষ হয়েছে`} sub={info.next ? `কাল থেকে ${info.next.name_bn}` : 'কাজ শেষের দিকে'}
            onClick={() => { patch({ progress: { stage_seq: cur.seq, state: 'done' } }); next() }} />
        </div>
        <p className="hint" style={{ marginTop: '1.2rem' }}>শতকরা কত হল সেটা আপনাকে আন্দাজ করতে হবে না — ধাপের ওজন থেকে নিজে থেকে হিসাব হয়ে যায়।</p>
      </div>
    </>
  )
}

/* ---------- 7. cash ---------- */

function StepCash({ s, draft, patch, next }: StepProps) {
  const cash = useMemo(() => cashState(s.entries, s.settings.opening_cash, s.settings.opening_date), [s.entries, s.settings])
  const spentToday = dayTotal(draft)
  const expected = Math.round(cash.computed - spentToday)
  const [counting, setCounting] = useState(false)
  const [value, setValue] = useState('')
  const diff = draft.cash_counted != null ? draft.cash_counted - expected : null
  // Before he has ever counted, the book has no idea what is in his pocket —
  // so ask him to count rather than offering a figure built out of nothing.
  const neverCounted = !s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) && !s.settings.opening_cash

  if (counting) {
    return (
      <>
        <div className="scroll">
          <h2 className="question">গুনে কত হল?</h2>
          <MoneyPad value={value} onChange={setValue} />
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setCounting(false)}>ফিরে</button>
          <button className="btn primary" disabled={!value} onClick={() => { patch({ cash_counted: Number(value) }); setCounting(false) }}>ঠিক আছে</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{QUESTION.cash}</h2>
        {neverCounted && draft.cash_counted == null ? (
          <p className="hint">প্রথমবার — একবার গুনে বলে দিন, তারপর থেকে অ্যাপ নিজেই হিসাব রাখবে।</p>
        ) : (
          <>
            <p className="hint">{draft.cash_counted != null ? 'আপনি গুনে বললেন' : 'খাতার হিসাবে এখন থাকার কথা'}</p>
            <div className="moneyfield num" style={{ paddingTop: '.2rem' }}>{money(draft.cash_counted ?? expected)}</div>
            {draft.cash_counted != null && (
              <p className="hint" style={{ textAlign: 'center', marginTop: '-.4rem' }}>খাতায় ছিল {money(expected)}</p>
            )}
          </>
        )}
        {diff != null && Math.abs(diff) >= 1 && (
          <div className={'alert ' + (Math.abs(diff) > 2000 ? 'crit' : 'warn')} style={{ marginTop: '.6rem' }}>
            <span className="dot" />
            <span>খাতার থেকে {money(Math.abs(diff))} {diff > 0 ? 'বেশি' : 'কম'}। কোনো খরচ লিখতে ভুলে গেছেন কি?</span>
          </div>
        )}
        <div className="rowlist" style={{ marginTop: '1.1rem' }}>
          {neverCounted && draft.cash_counted == null ? (
            <>
              <Pick title="গুনে বলছি" onClick={() => { setValue(''); setCounting(true) }} />
              <Pick title="থাক, পরে" onClick={next} />
            </>
          ) : (
            <>
              <Pick title={draft.cash_counted != null ? 'ঠিক আছে, এগোই' : 'হ্যাঁ, এটাই আছে'}
                onClick={() => { if (draft.cash_counted == null) patch({ cash_counted: expected }); next() }} />
              <Pick title={draft.cash_counted != null ? 'আবার গুনি' : 'না, গুনে বলছি'} onClick={() => { setValue(''); setCounting(true) }} />
            </>
          )}
        </div>
        <p className="hint" style={{ marginTop: '1.2rem' }}>
          {!neverCounted && cash.anchor_date
            ? `শেষ গোনা হয়েছিল ${dayLabelBn(cash.anchor_date)}, তখন ছিল ${money(cash.anchor_amount)}।`
            : ''}
        </p>
      </div>
      {draft.cash_counted != null && (
        <div className="actionbar"><button className="btn primary" onClick={next}>এগিয়ে যান</button></div>
      )}
    </>
  )
}

/* ---------- 8. review ---------- */

function StepReview({ s, draft, project_bn, onJump, onSave, extrasAvailable, onExtras, patch }: {
  s: State; draft: Draft; project_bn: string; onJump: (id: StepId) => void; onSave: () => void
  extrasAvailable: boolean; onExtras: () => void; patch: (p: Partial<Draft>) => void
}) {
  const [saving, setSaving] = useState(false)
  const men = Object.keys(draft.att).length
  const empty = draftIsEmpty(draft)
  return (
    <>
      <div className="scroll">
        <h2 className="question">{QUESTION.review}</h2>
        <p className="hint">{project_bn ? project_bn + ' · ' : ''}{dateBn(draft.date)}</p>
        <div className="card">
          <button className="review-row" onClick={() => onJump('attendance')}>
            <span><span className="t">মজুরি</span><span className="k">{toBn(men)} জন</span></span>
            <span className="v num">{money(wageTotal(draft))}</span>
            <Icon name="fwd" size={16} />
          </button>
          <button className="review-row" onClick={() => onJump('material')}>
            <span><span className="t">মাল</span><span className="k">{draft.mats.length ? draft.mats.map((m) => nameOf(s, m.item_id)).join(', ') : 'কিছু আসেনি'}</span></span>
            <span className="v num">{money(matTotal(draft))}</span>
            <Icon name="fwd" size={16} />
          </button>
          <button className="review-row" onClick={() => onJump('expense')}>
            <span><span className="t">অন্য খরচ</span><span className="k">{draft.exps.length ? draft.exps.map((e) => e.head_bn).join(', ') : 'কিছু নেই'}</span></span>
            <span className="v num">{money(expTotal(draft))}</span>
            <Icon name="fwd" size={16} />
          </button>
          <div className="total"><span className="k">আজকের মোট খরচ</span><span className="v num">{money(dayTotal(draft))}</span></div>
        </div>

        <div className="card">
          <button className="review-row" onClick={() => onJump('progress')}>
            <span><span className="t">কাজের অগ্রগতি</span>
              <span className="k">{draft.progress ? (draft.progress.state === 'done' ? 'একটা ধাপ শেষ' : 'অর্ধেক হয়েছে') : 'আজ বদল নেই'}</span></span>
            <Icon name="fwd" size={16} />
          </button>
          <button className="review-row" onClick={() => onJump('cash')}>
            <span><span className="t">হাতে টাকা</span><span className="k">দিনের শেষে</span></span>
            <span className="v num">{draft.cash_counted != null ? money(draft.cash_counted) : '—'}</span>
            <Icon name="fwd" size={16} />
          </button>
        </div>

        <div className="field" style={{ marginTop: '1rem' }}>
          <label>কিছু লিখে রাখবেন? (ইচ্ছে হলে)</label>
          <textarea className="input" value={draft.note} onChange={(e) => patch({ note: e.target.value })} placeholder="যেমন — বিকেলে বৃষ্টিতে কাজ বন্ধ" />
        </div>

        {extrasAvailable && (
          <button className="btn quiet small" style={{ marginTop: '.4rem' }} onClick={onExtras}>আরও কিছু আছে?</button>
        )}
        {empty && <p className="hint" style={{ marginTop: '1rem' }}>আজ কিছুই লেখা হয়নি। এভাবে সেভ করলে শুধু ‘আজ কাজ হয়নি’ লেখা থাকবে।</p>}
      </div>
      <div className="actionbar">
        <button className="btn primary" disabled={saving} onClick={() => { setSaving(true); void onSave() }}>
          {saving ? 'সেভ হচ্ছে…' : 'সেভ করুন'}
        </button>
      </div>
    </>
  )
}

/* ---------- inline master creation ---------- */

export function NewItemSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (i: Item) => void }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const units = ['বস্তা', 'কেজি', 'পিস', 'ঘনফুট', 'ট্রাক', 'লিটার', 'ফুট']
  const create = async () => {
    const it: Item = { id: uid(), kind: 'item', name_bn: name.trim(), unit_bn: unit || 'পিস', last_rate: null, active: true, updated_at: new Date().toISOString() }
    await saveMaster(it)
    onCreated(it)
  }
  return (
    <Sheet title="নতুন মাল" onClose={onClose}>
      <Field label="মালের নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন — সিমেন্ট" autoFocus /></Field>
      <Field label="কীসের হিসাবে">
        <div className="chips">{units.map((u) => <Chip key={u} on={unit === u} onClick={() => setUnit(u)}>{u}</Chip>)}</div>
      </Field>
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem' }}>যোগ করুন</button>
    </Sheet>
  )
}

export function NewPartySheet({ onClose, onCreated, kind = 'supplier' }: { onClose: () => void; onCreated: (p: Party) => void; kind?: 'supplier' | 'client' }) {
  const [name, setName] = useState('')
  const [terms, setTerms] = useState<number | null>(0)
  const create = async () => {
    const p: Party = { id: uid(), kind: 'party', name_bn: name.trim(), ptype: kind, terms_days: terms ?? 0, phone: '', updated_at: new Date().toISOString() }
    await saveMaster(p)
    onCreated(p)
  }
  return (
    <Sheet title={kind === 'supplier' ? 'নতুন দোকান' : 'নতুন খদ্দের'} onClose={onClose}>
      <Field label="নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      {kind === 'supplier' && (
        <Field label="কত দিনের বাকিতে দেয় (না জানলে ০)"><NumField value={terms} onChange={setTerms} /></Field>
      )}
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem' }}>যোগ করুন</button>
    </Sheet>
  )
}

/** Keep the first row of chips full: ranked entries first, then anything else
    he has on file, so a new user is not sent into a sheet for every tap. */
function pad<T extends { id: ID }>(ranked: T[], all: T[], n: number): T[] {
  const out = ranked.slice(0, n)
  for (const x of all) {
    if (out.length >= n) break
    if (!out.some((y) => y.id === x.id)) out.push(x)
  }
  return out
}

interface StepProps { s: State; draft: Draft; patch: (p: Partial<Draft>) => void; next: () => void }
