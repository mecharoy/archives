import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, CheckPick, Pick, Chip, Sheet, MoneyPad, Field, NumField, PhoneField, useToast, Toast } from '../ui/kit'
import { useStore, getState, activeProjects, workers, allWorkers, items, parties, stages, saveEntries, saveMaster, noteChip, nameOf, type State } from '../lib/store'
import { uid } from '../lib/db'
import { money, toBn, dayLabelBn, dateBn, isoDate, addDays, num } from '../lib/bn'
import { MONEY_HEADS_SITE, PAY_MODES, type ID, type Presence, type Item, type Party, type Project, type Worker } from '../lib/model'
import { DAYS_FOR, newDraft, loadDraft, saveDraft, clearDraft, buildEntries, wageTotal, matTotal, expTotal, dayTotal, draftIsEmpty, type Draft, type DraftMat, type DraftExp } from '../lib/draft'
import { lastAttendance, rankItems, rankHeads, rankParties, lastPurchase, qtyChips, amountChips, screenDemoted, rankProjects } from '../lib/suggest'
import { cashState, currentStage } from '../lib/calc'
import { capture } from '../lib/photo'
import { searchCatalog, CATS, VARIANTS } from '../lib/catalog'
import { ContactPicker } from './Settings'
import { HOUSE } from '../lib/seed'
import { scheduleSync } from '../lib/sync'
import { t, tf } from '../lib/i18n'
import { useBackHandler } from '../lib/back'

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
    /* No men on the books means "who came today?" has no possible answer —
       an empty screen and a hint pointing at Settings is a dead end, not a
       question. A man who only runs a shop never sees these two at all; the
       moment he puts one name in, they come back on their own. */
    if (allWorkers(s).length > 0) list.push('attendance', 'wages')
    if (!demoted.material || showExtras || (draft?.mats.length ?? 0) > 0) list.push('material')
    if (!demoted.expense || showExtras || (draft?.exps.length ?? 0) > 0) list.push('expense')
    if (!demoted.progress || showExtras || draft?.progress) list.push('progress')
    list.push('cash', 'review')
    return list
  }, [s, demoted, showExtras, draft?.mats.length, draft?.exps.length, draft?.progress])

  /* Back is one step, not out of the whole day. Registered above the early
     return, because hooks cannot be conditional — it does the same thing the
     arrow in the corner does. */
  useBackHandler(() => (i > 0 ? setI(i - 1) : onExit(false)))

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
  const [newProject, setNewProject] = useState(false)
  const list = useMemo(() => {
    const act = activeProjects(s)
    const order = rankProjects(s.entries, act.map((p) => p.id))
    return order.map((id) => act.find((p) => p.id === id)!).filter(Boolean)
  }, [s])
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t(QUESTION.project)}</h2>
        <p className="hint">{dateBn(draft.date)}</p>
        <div className="rowlist">
          {list.map((p) => (
            <Pick key={p.id} on={draft.project_id === p.id}
              title={p.name_bn} sub={p.client_bn || undefined}
              right={<Icon name="fwd" size={18} />}
              onClick={() => { patch({ project_id: p.id }); next() }} />
          ))}
          <Pick title="+ নতুন কাজ" onClick={() => setNewProject(true)} />
          {/* With no site running at all the day still has to be enterable —
              mistri, dokan and cash do not wait for a contract. The entries
              simply carry no project, and join one only when he starts one. */}
          {list.length === 0 && (
            <Pick title="কোনো কাজ চলছে না" sub="শুধু দোকান আর হাতের হিসাব"
              right={<Icon name="fwd" size={18} />}
              onClick={() => { patch({ project_id: '' }); next() }} />
          )}
        </div>
      </div>
      {newProject && (
        <NewProjectSheet onClose={() => setNewProject(false)}
          onCreated={(p) => { setNewProject(false); patch({ project_id: p.id }); next() }} />
      )}
    </>
  )
}

/* ---------- 2. attendance ---------- */

function StepAttendance({ s, draft, patch, next }: StepProps) {
  const men = workers(s)
  const suggested = useMemo(() => lastAttendance(s.entries, draft.project_id), [s.entries, draft.project_id])
  const [seeded, setSeeded] = useState(false)
  const [longPress, setLongPress] = useState<ID | null>(null)
  const [newMan, setNewMan] = useState(false)

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
        <h2 className="question">{t(QUESTION.attendance)}</h2>
        <p className="hint">
          {suggested.size ? t('গতবারের মতো টিক দেওয়া আছে। যে আসেনি তার টিক তুলে দিন।') : t('যারা এসেছে তাদের টিক দিন।')}
          {' '}{t('আধা দিন বা ওভারটাইম দিতে নামের উপর চেপে ধরুন।')}
        </p>
        <div className="rowlist">
          {men.map((w) => {
            const a = draft.att[w.id]
            return (
              <div key={w.id} {...hold(w.id)}>
                <CheckPick
                  on={!!a}
                  title={w.name_bn}
                  sub={a && a.presence !== 'full' ? (a.presence === 'half' ? t('আধা দিন') : t('ওভারটাইম')) : tf('দিনে {0}', money(w.rate))}
                  right={a ? money(a.amount) : ''}
                  onClick={() => toggle(w.id)}
                />
              </div>
            )
          })}
          <Pick title="+ নতুন লোক" onClick={() => setNewMan(true)} />
        </div>
      </div>
      <div className="actionbar">
        <div className="btn ghost" style={{ display: 'grid', placeItems: 'center', minWidth: '6.5rem' }}>
          <span className="num">{tf('{0} জন', toBn(count))}</span>
        </div>
        <button className="btn primary" onClick={next}>{t("এগিয়ে যান")}</button>
      </div>
      {newMan && <NewWorkerSheet onClose={() => setNewMan(false)} onCreated={() => setNewMan(false)} />}
      {longPress && (
        <Sheet title={nameOf(s, longPress)} onClose={() => setLongPress(null)}>
          <div className="rowlist">
            {(['full', 'half', 'ot'] as Presence[]).map((p) => (
              <Pick key={p} on={draft.att[longPress]?.presence === p}
                title={p === 'full' ? t('পুরো দিন') : p === 'half' ? t('আধা দিন') : t('ওভারটাইম (দেড় দিন)')}
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
        <h2 className="question">{t(QUESTION.wages)}</h2>
        <p className="hint">{t("রোজ অনুযায়ী হিসাব করা আছে। আলাদা দিলে সেই লাইনে চাপ দিন।")}</p>
        {rows.length === 0 && <p className="hint">{t("কেউ আসেনি, তাই মজুরি নেই।")}</p>}
        <div className="card">
          {rows.map(([wid, a]) => (
            <button key={wid} className="review-row" onClick={() => open(wid)}>
              <span>
                <span className="t">{nameOf(s, wid)}</span>
                <span className="k">
                  {tf('{0} দিন × {1}', toBn(DAYS_FOR[a.presence]), money(a.rate))}
                  {a.advance > 0 && tf(' · অগ্রিম {0}', money(a.advance))}
                </span>
              </span>
              <span className="v num">{money(a.amount + a.advance)}</span>
            </button>
          ))}
          {rows.length > 0 && (
            <div className="total">
              <span className="k">{t("মোট মজুরি")}</span>
              <span className="v num">{money(wageTotal(draft))}</span>
            </div>
          )}
        </div>
      </div>
      <div className="actionbar"><button className="btn primary" onClick={next}>{t("এগিয়ে যান")}</button></div>
      {editing && (
        <Sheet title={nameOf(s, editing)} onClose={commit}>
          <div className="chips" style={{ marginBottom: '.6rem' }}>
            <Chip on={tab === 'amount'} onClick={() => setTab('amount')}>{t("মজুরি")}</Chip>
            <Chip on={tab === 'advance'} onClick={() => setTab('advance')}>{t("অগ্রিম")}</Chip>
          </div>
          {tab === 'amount'
            ? <MoneyPad value={amount} onChange={setAmount} />
            : <MoneyPad value={advance} onChange={setAdvance} />}
          <button className="btn primary" style={{ marginTop: '.8rem' }} onClick={commit}>{t("ঠিক আছে")}</button>
        </Sheet>
      )}
    </>
  )
}

/* ---------- 4. material ---------- */

function StepMaterial({ s, draft, patch, next }: StepProps) {
  // Straight to the chips. The old yes/no screen asked a question the next
  // screen answered anyway; the way past it is now a button on the same screen.
  const [sub, setSub] = useState<'ask' | 'item' | 'qty' | 'rate'>(draft.mats.length ? 'ask' : 'item')
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
          <h2 className="question">{t(QUESTION.material)}</h2>
          <p className="hint">{t("আজ কোনো মাল এলে এখানে লিখুন।")}</p>
          {draft.mats.length > 0 && (
            <div className="card" style={{ marginBottom: '.9rem' }}>
              {draft.mats.map((m) => (
                <div key={m.key} className="review-row">
                  <span>
                    <span className="t">{nameOf(s, m.item_id)}</span>
                    <span className="k">{num(m.qty, m.qty % 1 ? 2 : 0)} {t(itemOf(m.item_id)?.unit_bn || '')} × {money(m.rate)}{m.paid ? '' : t(' · বাকি')}</span>
                  </span>
                  <span className="v num">{money(m.qty * m.rate)}</span>
                  <button className="iconbtn" onClick={() => patch({ mats: draft.mats.filter((x) => x.key !== m.key) })} aria-label="বাদ দিন">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ))}
              <div className="total"><span className="k">{t("মোট")}</span><span className="v num">{money(matTotal(draft))}</span></div>
            </div>
          )}
          <div className="yesno">
            <button onClick={next}>{t("না")}</button>
            <button className="on" onClick={() => setSub('item')}>{draft.mats.length ? t('আরও মাল') : t('হ্যাঁ')}</button>
          </div>
        </div>
        {draft.mats.length > 0 && <div className="actionbar"><button className="btn primary" onClick={next}>{t("এগিয়ে যান")}</button></div>}
      </>
    )
  }

  if (sub === 'item') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t("কী মাল?")}</h2>
          <p className="hint">{t("যেগুলো বেশি আনেন সেগুলো আগে দেখানো হচ্ছে।")}</p>
          <div className="chips">
            {top.map((it) => <Chip key={it.id} onClick={() => { noteChip(true); startItem(it) }}>{it.name_bn}</Chip>)}
            {rest.length > 0 && <Chip onClick={() => { noteChip(false); setShowAll(true) }}>{t("আরও…")}</Chip>}
            {all.length === 0 && <Chip onClick={() => setNewItem(true)}>{t("নতুন মাল যোগ করুন")}</Chip>}
          </div>
        </div>
        <div className="actionbar">
          {draft.mats.length > 0
            ? <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSub('ask')}>{t("ফিরে যান")}</button>
            : <button className="btn ghost" style={{ flex: 1 }} onClick={next}>{t("আজ মাল আসেনি")}</button>}
        </div>
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
          <h2 className="question">{tf('{0} কত {1}?', t(it?.name_bn || ''), t(it?.unit_bn || ''))}</h2>
          <MoneyPad value={qty} onChange={setQty} prefix="" allowDecimal chips={chips} onChipTaken={() => noteChip(true)} />
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSub('item')}>{t("ফিরে")}</button>
          <button className="btn primary" disabled={!Number(qty)} onClick={() => setSub('rate')}>{t("এগিয়ে যান")}</button>
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
        <h2 className="question">{tf('{0} দর কত?', t(item?.name_bn || ''))}</h2>
        <p className="hint">
          {last ? tf('গতবার {0} প্রতি {1} · {2}', money(last.rate), item?.unit_bn, dayLabelBn(last.date)) : t('প্রথমবার — যা দিলেন লিখুন।')}
        </p>
        <MoneyPad value={rate} onChange={setRate} allowDecimal />
        {rateNum > 0 && (
          <div className="card" style={{ marginTop: '.9rem' }}>
            <div className="spread"><span>{num(qty, qty % 1 ? 2 : 0)} {item?.unit_bn} × {money(rateNum)}</span>
              <strong className="num">{money(qty * rateNum)}</strong></div>
            {rise && <p className="small" style={{ color: 'var(--warn)', marginTop: '.4rem' }}>
              {tf('গতবারের থেকে {0}% বেশি।', toBn(Math.round(((rateNum - last!.rate) / last!.rate) * 100)))}</p>}
          </div>
        )}

        <p className="sectionlabel">{t("কার কাছ থেকে")}</p>
        <div className="chips">
          {top.map((p) => <Chip key={p.id} on={party === p.id} onClick={() => setParty(party === p.id ? '' : p.id)}>{p.name_bn}</Chip>)}
          {rest.length > 0 && <Chip onClick={() => setAllParties(true)}>{t("আরও…")}</Chip>}
          {suppliers.length === 0 && <Chip onClick={() => setNewParty(true)}>{t("+ দোকান যোগ করুন")}</Chip>}
        </div>

        <p className="sectionlabel">{t("টাকা দিয়েছেন?")}</p>
        <div className="yesno">
          <button className={paid === true ? 'on' : ''} onClick={() => setPaid(true)}>{t("হ্যাঁ, দিয়েছি")}</button>
          <button className={paid === false ? 'on' : ''} onClick={() => setPaid(false)}>{t("না, বাকি")}</button>
        </div>
        {paid === false && (
          <p className="hint" style={{ marginTop: '.7rem' }}>
            {partyObj?.terms_days
              ? tf('{0} — {1} দিনের মধ্যে, অর্থাৎ {2}।', partyObj.name_bn, toBn(partyObj.terms_days), dateBn(addDays(isoDate(), partyObj.terms_days), false))
              : t('হিসাবে বাকি হিসেবে থাকবে।')}
          </p>
        )}

        <button className="btn quiet small" style={{ marginTop: '1rem' }}
          onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon name="camera" size={18} />{photo ? t('বিলের ছবি নেওয়া হয়েছে') : t('বিলের ছবি (ইচ্ছে হলে)')}
          </span>
        </button>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={onBack}>{t("ফিরে")}</button>
        <button className="btn primary" disabled={!rateNum || paid === null} onClick={() => onDone(paid === true, party, photo)}>{t("যোগ করুন")}</button>
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

/* ---------- 5. other expenses ---------- */

function StepExpense({ s, draft, patch, next }: StepProps) {
  const [sub, setSub] = useState<'ask' | 'head' | 'amount'>(draft.exps.length ? 'ask' : 'head')
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
          <h2 className="question">{t(QUESTION.expense)}</h2>
          <p className="hint">{t("গাড়ি ভাড়া, মেশিন, চা — মজুরি আর মাল ছাড়া বাকি সব।")}</p>
          {draft.exps.length > 0 && (
            <div className="card" style={{ marginBottom: '.9rem' }}>
              {draft.exps.map((e) => (
                <div key={e.key} className="review-row">
                  <span><span className="t">{t(e.head_bn)}</span><span className="k">{t(e.mode)}</span></span>
                  <span className="v num">{money(e.amount)}</span>
                  <button className="iconbtn" onClick={() => patch({ exps: draft.exps.filter((x) => x.key !== e.key) })} aria-label="বাদ দিন"><Icon name="trash" size={18} /></button>
                </div>
              ))}
              <div className="total"><span className="k">{t("মোট")}</span><span className="v num">{money(expTotal(draft))}</span></div>
            </div>
          )}
          <div className="yesno">
            <button onClick={next}>{t("না")}</button>
            <button className="on" onClick={() => setSub('head')}>{draft.exps.length ? t('আরও খরচ') : t('হ্যাঁ')}</button>
          </div>
        </div>
        {draft.exps.length > 0 && <div className="actionbar"><button className="btn primary" onClick={next}>{t("এগিয়ে যান")}</button></div>}
      </>
    )
  }

  if (sub === 'head') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t("কীসের খরচ?")}</h2>
          <div className="chips">
            {top.map((h) => <Chip key={h} onClick={() => { noteChip(true); setHead(h); setSub('amount') }}>{h}</Chip>)}
            <Chip onClick={() => { noteChip(false); setShowAll(true) }}>{t("আরও…")}</Chip>
          </div>
          <p className="hint" style={{ marginTop: '1.1rem' }}>{t("মজুরি এখানে লিখবেন না — সেটা আগের পাতায় হিসাব হয়ে গেছে।")}</p>
        </div>
        <div className="actionbar">
          {draft.exps.length > 0
            ? <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSub('ask')}>{t("ফিরে যান")}</button>
            : <button className="btn ghost" style={{ flex: 1 }} onClick={next}>{t("আর কোনো খরচ নেই")}</button>}
        </div>
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
        <h2 className="question">{tf('{0} — কত?', t(head))}</h2>
        <MoneyPad value={amount} onChange={setAmount} chips={chips} onChipTaken={() => noteChip(true)} />
        <p className="sectionlabel">{t("কীভাবে দিলেন")}</p>
        <div className="chips">
          {PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}
        </div>
        <button className="btn quiet small" style={{ marginTop: '1rem' }}
          onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon name="camera" size={18} />{photo ? t('ছবি নেওয়া হয়েছে') : t('বিলের ছবি (ইচ্ছে হলে)')}
          </span>
        </button>
      </div>
      <div className="actionbar">
        <button className="btn ghost" onClick={() => setSub('head')}>{t("ফিরে")}</button>
        <button className="btn primary" disabled={!Number(amount)} onClick={add}>{t("যোগ করুন")}</button>
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
          <h2 className="question">{t(QUESTION.progress)}</h2>
          <p className="hint">{t("এই কাজের ধাপগুলো এখনও ঠিক করা হয়নি। সেটিংস → ধাপ থেকে একবার ঠিক করে নিলে এখানে কাজের অগ্রগতি নিজে থেকেই হিসাব হবে।")}</p>
        </div>
        <div className="actionbar"><button className="btn primary" onClick={next}>{t("এগিয়ে যান")}</button></div>
      </>
    )
  }
  const cur = info.current
  const chosen = draft.progress?.stage_seq === cur.seq ? draft.progress.state : info.isHalf ? 'half' : null
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t(QUESTION.progress)}</h2>
        <p className="hint">{t("এখন চলছে —")} <strong>{cur.name_bn}</strong>{info.next ? tf(' · এরপর {0}', info.next.name_bn) : ''}</p>
        <div className="rowlist">
          <Pick on={chosen === null && !draft.progress} title="এখনও চলছে" sub="আজ আলাদা কিছু হয়নি"
            onClick={() => { patch({ progress: null }); next() }} />
          <Pick on={chosen === 'half'} title={tf('{0} — অর্ধেক হয়েছে', cur.name_bn)}
            onClick={() => { patch({ progress: { stage_seq: cur.seq, state: 'half' } }); next() }} />
          <Pick on={chosen === 'done'} title={tf('{0} — শেষ হয়েছে', cur.name_bn)} sub={info.next ? tf('কাল থেকে {0}', info.next.name_bn) : t('কাজ শেষের দিকে')}
            onClick={() => { patch({ progress: { stage_seq: cur.seq, state: 'done' } }); next() }} />
        </div>
        <p className="hint" style={{ marginTop: '1.2rem' }}>{t("শতকরা কত হল সেটা আপনাকে আন্দাজ করতে হবে না — ধাপের ওজন থেকে নিজে থেকে হিসাব হয়ে যায়।")}</p>
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
          <h2 className="question">{t("গুনে কত হল?")}</h2>
          <MoneyPad value={value} onChange={setValue} />
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setCounting(false)}>{t("ফিরে")}</button>
          <button className="btn primary" disabled={!value} onClick={() => { patch({ cash_counted: Number(value) }); setCounting(false) }}>{t("ঠিক আছে")}</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t(QUESTION.cash)}</h2>
        {neverCounted && draft.cash_counted == null ? (
          <p className="hint">{t("প্রথমবার — একবার গুনে বলে দিন, তারপর থেকে অ্যাপ নিজেই হিসাব রাখবে।")}</p>
        ) : (
          <>
            <p className="hint">{draft.cash_counted != null ? t('আপনি গুনে বললেন') : t('খাতার হিসাবে এখন থাকার কথা')}</p>
            <div className="moneyfield num" style={{ paddingTop: '.2rem' }}>{money(draft.cash_counted ?? expected)}</div>
            {draft.cash_counted != null && (
              <p className="hint" style={{ textAlign: 'center', marginTop: '-.4rem' }}>{tf('খাতায় ছিল {0}', money(expected))}</p>
            )}
          </>
        )}
        {diff != null && Math.abs(diff) >= 1 && (
          <div className={'alert ' + (Math.abs(diff) > 2000 ? 'crit' : 'warn')} style={{ marginTop: '.6rem' }}>
            <span className="dot" />
            <span>{tf('খাতার থেকে {0} {1}। কোনো খরচ লিখতে ভুলে গেছেন কি?', money(Math.abs(diff)), diff > 0 ? t('বেশি') : t('কম'))}</span>
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
              <Pick title={draft.cash_counted != null ? t('ঠিক আছে, এগোই') : t('হ্যাঁ, এটাই আছে')}
                onClick={() => { if (draft.cash_counted == null) patch({ cash_counted: expected }); next() }} />
              <Pick title={draft.cash_counted != null ? t('আবার গুনি') : t('না, গুনে বলছি')} onClick={() => { setValue(''); setCounting(true) }} />
            </>
          )}
        </div>
        <p className="hint" style={{ marginTop: '1.2rem' }}>
          {!neverCounted && cash.anchor_date
            ? tf('শেষ গোনা হয়েছিল {0}, তখন ছিল {1}।', dayLabelBn(cash.anchor_date), money(cash.anchor_amount))
            : ''}
        </p>
      </div>
      {draft.cash_counted != null && (
        <div className="actionbar"><button className="btn primary" onClick={next}>{t("এগিয়ে যান")}</button></div>
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
        <h2 className="question">{t(QUESTION.review)}</h2>
        <p className="hint">{project_bn ? project_bn + ' · ' : ''}{dateBn(draft.date)}</p>
        <div className="card">
          <button className="review-row" onClick={() => onJump('attendance')}>
            <span><span className="t">{t("মজুরি")}</span><span className="k">{tf('{0} জন', toBn(men))}</span></span>
            <span className="v num">{money(wageTotal(draft))}</span>
            <Icon name="fwd" size={16} />
          </button>
          <button className="review-row" onClick={() => onJump('material')}>
            <span><span className="t">{t("মাল")}</span><span className="k">{draft.mats.length ? draft.mats.map((m) => nameOf(s, m.item_id)).join(', ') : t('কিছু আসেনি')}</span></span>
            <span className="v num">{money(matTotal(draft))}</span>
            <Icon name="fwd" size={16} />
          </button>
          <button className="review-row" onClick={() => onJump('expense')}>
            <span><span className="t">{t("অন্য খরচ")}</span><span className="k">{draft.exps.length ? draft.exps.map((e) => t(e.head_bn)).join(', ') : t('কিছু নেই')}</span></span>
            <span className="v num">{money(expTotal(draft))}</span>
            <Icon name="fwd" size={16} />
          </button>
          <div className="total"><span className="k">{t("আজকের মোট খরচ")}</span><span className="v num">{money(dayTotal(draft))}</span></div>
        </div>

        <div className="card">
          <button className="review-row" onClick={() => onJump('progress')}>
            <span><span className="t">{t("কাজের অগ্রগতি")}</span>
              <span className="k">{draft.progress ? (draft.progress.state === 'done' ? t('একটা ধাপ শেষ') : t('অর্ধেক হয়েছে')) : t('আজ বদল নেই')}</span></span>
            <Icon name="fwd" size={16} />
          </button>
          <button className="review-row" onClick={() => onJump('cash')}>
            <span><span className="t">{t("হাতে টাকা")}</span><span className="k">{t("দিনের শেষে")}</span></span>
            <span className="v num">{draft.cash_counted != null ? money(draft.cash_counted) : '—'}</span>
            <Icon name="fwd" size={16} />
          </button>
        </div>

        <div className="field" style={{ marginTop: '1rem' }}>
          <label>{t("কিছু লিখে রাখবেন? (ইচ্ছে হলে)")}</label>
          <textarea className="input" value={draft.note} onChange={(e) => patch({ note: e.target.value })} placeholder="যেমন — বিকেলে বৃষ্টিতে কাজ বন্ধ" />
        </div>

        {extrasAvailable && (
          <button className="btn quiet small" style={{ marginTop: '.4rem' }} onClick={onExtras}>{t("আরও কিছু আছে?")}</button>
        )}
        {empty && <p className="hint" style={{ marginTop: '1rem' }}>{t("আজ কিছুই লেখা হয়নি। এভাবে সেভ করলে শুধু ‘আজ কাজ হয়নি’ লেখা থাকবে।")}</p>}
      </div>
      <div className="actionbar">
        <button className="btn primary" disabled={saving} onClick={() => { setSaving(true); void onSave() }}>
          {saving ? t('সেভ হচ্ছে…') : t('সেভ করুন')}
        </button>
      </div>
    </>
  )
}

/* ---------- inline master creation ---------- */

/* Adding a new item: type the name, or tap it out of the common list. The
   catalogue is a lookup, not a suggestion — nothing in it exists in his ledger
   until he picks it, and the wizard's chips still come only from what he has
   actually bought. Whatever he types wins: the typed name is what gets saved
   if he presses যোগ করুন, and the list below is only ever a shortcut to it. */
export function NewItemSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (i: Item) => void }) {
  const s = useStore((x) => x)
  const [base, setBase] = useState('')
  const [variant, setVariant] = useState('')
  const [writing, setWriting] = useState<string | null>(null)   // which group's own-words box is open
  const [own, setOwn] = useState('')
  const [unit, setUnit] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const units = ['বস্তা', 'কেজি', 'পিস', 'ঘনফুট', 'ট্রাক', 'লিটার', 'ফুট', 'মিটার', 'বর্গফুট', 'প্যাকেট']
  const have = useMemo(() => new Set(items(s).map((i) => i.name_bn)), [s.masters])
  const found = useMemo(() => searchCatalog(base, cat, have).slice(0, 60), [base, cat, have])

  /* Name and size are kept apart while he is choosing and joined only on the
     way out. Inferring the size back out of the finished name is what made a
     chosen size impossible to un-choose: ১/২" ends with ২", so two chips lit
     at once and the wrong one came off. */
  const fullName = [base.trim(), variant.trim()].filter(Boolean).join(' ')

  const create = async (name_bn: string, unit_bn: string) => {
    const it: Item = { id: uid(), kind: 'item', name_bn, unit_bn, last_rate: null, active: true, updated_at: new Date().toISOString() }
    await saveMaster(it)
    onCreated(it)
  }

  const takeOwn = () => {
    const v = own.trim()
    if (v) setVariant(v)
    setOwn('')
    setWriting(null)
  }

  return (
    <Sheet title="নতুন মাল" onClose={onClose}>
      <Field label="মালের নাম"><input className="input" value={base} onChange={(e) => setBase(e.target.value)} placeholder="যেমন — সিমেন্ট" autoFocus /></Field>

      {base.trim() && (
        <Field label="মাপ বা ধরন (থাকলে)">
          {VARIANTS.map((g) => (
            <div key={g.group_bn} style={{ marginBottom: '.4rem' }}>
              <p className="small muted" style={{ margin: '.2rem 0' }}>{t(g.group_bn)}</p>
              <div className="chips">
                {g.values.map((v) => (
                  <Chip key={v} on={variant === v} onClick={() => setVariant(variant === v ? '' : v)}>{v}</Chip>
                ))}
                <Chip on={writing === g.group_bn} onClick={() => { setWriting(writing === g.group_bn ? null : g.group_bn); setOwn('') }}>
                  {t('+ নিজে লিখুন')}
                </Chip>
              </div>
              {writing === g.group_bn && (
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                  <input className="input" style={{ flex: 1 }} value={own} autoFocus
                    placeholder={g.group_bn === 'ইঞ্চি' ? '৫"' : g.group_bn === 'মিলিমিটার' ? '৩২ মিমি' : 'যেমন — গ্রেড ৫৩'}
                    onChange={(e) => setOwn(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') takeOwn() }} />
                  <button className="btn quiet small" disabled={!own.trim()} onClick={takeOwn}>{t('বসান')}</button>
                </div>
              )}
            </div>
          ))}
          {variant && (
            <div className="chips" style={{ marginTop: '.3rem' }}>
              <Chip on onClick={() => setVariant('')}>{variant} · {t('তুলে নিন')}</Chip>
            </div>
          )}
          <p className="small muted">{t('মাপ নামের সঙ্গেই থাকে, তাই ১" আর ২" পাইপের মজুত আলাদা করে গোনা হয়।')}</p>
        </Field>
      )}

      <Field label="কীসের হিসাবে">
        <div className="chips">
          {units.map((u) => <Chip key={u} on={unit === u} onClick={() => setUnit(unit === u ? '' : u)}>{u}</Chip>)}
        </div>
      </Field>

      {fullName && <p className="small muted" style={{ marginTop: '-.4rem' }}>{tf('যোগ হবে — {0} ({1})', fullName, t(unit || 'পিস'))}</p>}
      <button className="btn primary" disabled={!base.trim()} onClick={() => create(fullName, unit || 'পিস')} style={{ marginTop: '.6rem', width: '100%' }}>{t("যোগ করুন")}</button>

      <div className="divider" />
      <p className="sectionlabel" style={{ marginTop: 0 }}>{base.trim() ? t('চেনা তালিকায় যা মিলল') : t('চেনা তালিকা থেকে বেছে নিন')}</p>
      {!base.trim() && (
        <div className="chips">
          {CATS.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}</Chip>)}
        </div>
      )}
      {found.length > 0 && (
        <div className="rowlist" style={{ marginTop: '.6rem' }}>
          {found.map((c) => (
            <Pick key={c.name_bn} title={c.name_bn} sub={c.unit_bn} onClick={() => create(c.name_bn, c.unit_bn)} />
          ))}
        </div>
      )}
      {base.trim() && found.length === 0 && (
        <p className="small muted">{t("চেনা তালিকায় এই নামে কিছু নেই — উপরের ‘যোগ করুন’ টিপলেই নিজের নামে যোগ হয়ে যাবে।")}</p>
      )}
      {!base.trim() && !cat && (
        <p className="small muted">{t("পাইপ, ফিটিংস, ভালভ, বাথরুম, বিদ্যুৎ — মাপ ইঞ্চিতে। নাম টিপে বসালেই খোঁজাও যায়।")}</p>
      )}
    </Sheet>
  )
}

/* A job started from inside the day's entry — the contract arrives on a
   Tuesday, not on the day he set the app up. Name is enough; area, budget and
   plan days are all editable later in সেটিংস → কাজ. */
export function NewProjectSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [budget, setBudget] = useState<number | null>(null)
  const create = async () => {
    const p: Project = {
      id: uid(), kind: 'project', name_bn: name.trim(), client_bn: client.trim(), ptype: HOUSE,
      area_sqft: null, budget, start_date: isoDate(), plan_days: null, status: 'active',
      updated_at: new Date().toISOString(),
    }
    await saveMaster(p)
    onCreated(p)
  }
  return (
    <Sheet title="নতুন কাজ" onClose={onClose}>
      <Field label="কাজের নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন — রামপুর বাড়ি" autoFocus /></Field>
      <Field label="কার কাজ (ইচ্ছে হলে)"><input className="input" value={client} onChange={(e) => setClient(e.target.value)} /></Field>
      <Field label="চুক্তির টাকা (জানা থাকলে)"><NumField value={budget} onChange={setBudget} /></Field>
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem' }}>{t("যোগ করুন")}</button>
    </Sheet>
  )
}

export function NewWorkerSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (w: Worker) => void }) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState<number | null>(null)
  const create = async () => {
    const w: Worker = {
      id: uid(), kind: 'worker', name_bn: name.trim(), rate: rate ?? 0,
      phone: '', active: true, updated_at: new Date().toISOString(),
    }
    await saveMaster(w)
    onCreated(w)
  }
  return (
    <Sheet title="নতুন লোক" onClose={onClose}>
      <Field label="নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="একদিনের মজুরি (টাকা)"><NumField value={rate} onChange={setRate} /></Field>
      <button className="btn primary" disabled={!name.trim() || !rate} onClick={create}
        style={{ marginTop: '.6rem', width: '100%' }}>{t("যোগ করুন")}</button>
    </Sheet>
  )
}

export function NewPartySheet({ onClose, onCreated, kind = 'supplier' }: { onClose: () => void; onCreated: (p: Party) => void; kind?: 'supplier' | 'client' }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState<number | null>(0)
  const [book, setBook] = useState(false)
  const create = async () => {
    const p: Party = { id: uid(), kind: 'party', name_bn: name.trim(), ptype: kind, terms_days: terms ?? 0, phone: phone.trim(), updated_at: new Date().toISOString() }
    await saveMaster(p)
    onCreated(p)
  }
  if (book) return <ContactPicker onClose={() => setBook(false)} onPicked={(c) => { setName(name.trim() || c.name); setPhone(c.phone); setBook(false) }} />
  return (
    <Sheet title={kind === 'supplier' ? t('নতুন দোকান') : t('নতুন খদ্দের')} onClose={onClose}>
      <Field label="নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      {/* The person is almost certainly already in his phone. The mark inside
          the box fills both this and the name above in one tap. */}
      <Field label="ফোন (ইচ্ছে হলে)"><PhoneField value={phone} onChange={setPhone} onBook={() => setBook(true)} /></Field>
      {kind === 'supplier' && (
        <Field label="কত দিনের বাকিতে দেয় (না জানলে ০)"><NumField value={terms} onChange={setTerms} /></Field>
      )}
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem', width: '100%' }}>{t("যোগ করুন")}</button>
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
