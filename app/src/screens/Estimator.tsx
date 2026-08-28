import { useEffect, useMemo, useState } from 'react'
import { Icon, TopBar, Chip, Pick, MoneyPad, Field, NumField, useToast, Toast, Empty } from '../ui/kit'
import { useStore, items, coeffs, stages, projects, workers, type State } from '../lib/store'
import { kvGet, kvSet } from '../lib/db'
import { money, moneyExact, toBn, num, dateBn, isoDate } from '../lib/bn'
import { projectTotals } from '../lib/calc'
import { lastPurchase } from '../lib/suggest'
import { t, tf } from '../lib/i18n'

/* Quoting a job, one question at a time.

   No model anywhere near this screen, and none needed. Quantities come from
   his own thumb rules, rates from what he himself last paid, labour from
   either a crew he describes or a per-square-foot figure his own finished
   jobs produced. Anything he has never bought is named and left out rather
   than guessed at, because a quote built on an invented rate is how a
   contractor loses a year.

   The one thing that is arithmetic rather than judgement: built-up area is
   the floor area times the number of floors. Everything else he can see and
   change on its way to the total. */

type Step = 'type' | 'size' | 'material' | 'labour' | 'extras' | 'margin' | 'quote'
type LabourMode = 'daily' | 'sqft'

interface Crew { id: string; name: string; men: number | null; rate: number | null }
interface Extra { id: string; name: string; amount: number | null }

interface Prefs {
  labour_per_sqft: number | null
  overhead_pct: number
  profit_pct: number
  contingency_pct: number
  labour_mode: LabourMode
}
const DEFAULT_PREFS: Prefs = {
  labour_per_sqft: null, overhead_pct: 5, profit_pct: 12, contingency_pct: 3, labour_mode: 'daily',
}

/* Foundations are not a rate the app can know — a piled foundation on soft
   ground costs what the piling contractor says it costs. So the type is a
   label on the quote, and its money is a figure he types. */
const FOUNDATIONS = ['সাধারণ ফুটিং', 'র‍্যাফট / ম্যাট', 'পাইলিং', 'জানা নেই']

export function Estimator({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [step, setStep] = useState<Step>('type')
  const [ptype, setPtype] = useState('')
  const [area, setArea] = useState('')
  const [floors, setFloors] = useState<number | null>(1)
  const [foundation, setFoundation] = useState(FOUNDATIONS[0])
  const [foundationCost, setFoundationCost] = useState<number | null>(null)
  const [days, setDays] = useState<number | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [rateOverride, setRateOverride] = useState<Record<string, number>>({})
  const [crew, setCrew] = useState<Crew[]>([])
  const [extras, setExtras] = useState<Extra[]>([])
  const [client, setClient] = useState('')
  const toast = useToast()

  useEffect(() => { void kvGet<Prefs>('estimate_prefs', DEFAULT_PREFS).then((p) => setPrefs({ ...DEFAULT_PREFS, ...p })) }, [])
  const savePrefs = (p: Prefs) => { setPrefs(p); void kvSet('estimate_prefs', p) }

  const types = useMemo(() => [...new Set(stages(s).map((x) => x.project_type))], [s.masters])
  const historyLabour = useMemo(() => labourPerSqft(s), [s])
  const dayRate = useMemo(() => averageDayRate(s), [s.masters])

  const perFloor = Number(area) || 0
  const builtUp = perFloor * (floors || 1)

  /* ---- material ---- */
  const lines = useMemo(() => {
    const cs = coeffs(s).filter((c) => c.project_type === ptype)
    return cs.map((c) => {
      const it = items(s).find((i) => i.id === c.item_id)
      const qty = c.per_sqft * builtUp
      // What he actually paid last time beats whatever is on the master row,
      // and anything he types here beats both.
      const own = lastPurchase(s.entries, c.item_id)?.rate ?? it?.last_rate ?? 0
      const rate = rateOverride[c.item_id] ?? own
      return {
        item_id: c.item_id, name: it?.name_bn || '—', unit: it?.unit_bn || '',
        qty, rate, own, amount: qty * rate, known: rate > 0,
      }
    })
  }, [s, ptype, builtUp, rateOverride])

  const material = lines.reduce((a, l) => a + l.amount, 0)
  const missing = lines.filter((l) => !l.known)

  /* ---- labour ---- */
  const crewCost = crew.reduce((a, c) => a + (c.men || 0) * (c.rate || 0), 0) * (days || 0)
  const sqftCost = (prefs.labour_per_sqft ?? historyLabour ?? 0) * builtUp
  const labour = prefs.labour_mode === 'daily' ? crewCost : sqftCost

  /* ---- everything else ---- */
  const extrasCost = extras.reduce((a, e) => a + (e.amount || 0), 0) + (foundationCost || 0)
  const direct = material + labour + extrasCost
  const contingency = (direct * prefs.contingency_pct) / 100
  const overhead = ((direct + contingency) * prefs.overhead_pct) / 100
  const profit = ((direct + contingency + overhead) * prefs.profit_pct) / 100
  const total = direct + contingency + overhead + profit

  const addCrew = () => setCrew([...crew, { id: String(Date.now()), name: '', men: null, rate: dayRate }])
  const addExtra = () => setExtras([...extras, { id: String(Date.now()), name: '', amount: null }])

  /* ---- 1. what kind of job ---- */
  if (step === 'type') {
    return (
      <>
        <TopBar title="নতুন কাজের হিসাব" onBack={onBack} />
        <div className="scroll">
          <h2 className="question">{t("কী ধরনের কাজ?")}</h2>
          <p className="hint">{t('ধাপে ধাপে জিজ্ঞেস করা হবে — মাপ, ভিত, মাল, মজুরি, তারপর লাভ।')}</p>
          {types.length === 0 && (
            <Empty>{t("এখনও কোনো ধরন ঠিক করা নেই।")}<br />{t("সেটিংস → ধাপ ও থাম্ব রুল থেকে একবার বসিয়ে নিলে এই হিসাব কাজ করবে।")}</Empty>
          )}
          <div className="chips">
            {types.map((x) => <Chip key={x} on={ptype === x} onClick={() => { setPtype(x); setStep('size') }}>{t(x)}</Chip>)}
          </div>
        </div>
      </>
    )
  }

  /* ---- 2. size, floors, foundation, duration ---- */
  if (step === 'size') {
    return (
      <>
        <TopBar title={ptype} onBack={() => setStep('type')} />
        <div className="scroll">
          <h2 className="question">{t("এক তলার মাপ কত বর্গফুট?")}</h2>
          <p className="hint">{t('একটা তলার বিল্ট-আপ মাপ। তলার সংখ্যা নিচে বসালে মোট মাপ নিজে থেকেই বেরোবে।')}</p>
          <MoneyPad value={area} onChange={setArea} prefix="" />

          <Field label="কতগুলো তলা">
            <div className="chips">
              {[1, 2, 3, 4].map((n) => <Chip key={n} on={floors === n} onClick={() => setFloors(n)}>{toBn(n)}</Chip>)}
            </div>
          </Field>
          <NumField value={floors} onChange={setFloors} placeholder="তলা" />

          {builtUp > 0 && (
            <p className="small muted" style={{ marginTop: '.5rem' }}>
              {tf('মোট বিল্ট-আপ {0} বর্গফুট', toBn(Math.round(builtUp)))}
            </p>
          )}

          <div className="divider" />
          <p className="sectionlabel" style={{ marginTop: 0 }}>{t('ভিত কী ধরনের?')}</p>
          <div className="chips">
            {FOUNDATIONS.map((f) => <Chip key={f} on={foundation === f} onClick={() => setFoundation(f)}>{t(f)}</Chip>)}
          </div>
          <Field label="ভিতের জন্য আলাদা খরচ (জানা থাকলে)">
            <NumField value={foundationCost} onChange={setFoundationCost} />
          </Field>
          <p className="small muted" style={{ marginTop: '-.5rem' }}>
            {t('মাটি কাটা, পাইলিং, ঢালাইয়ের ঠিকা — যেটা আলাদা দিতে হয়। না জানলে ছেড়ে দিন, নিচের মালের হিসাবে ভিতের মালও ধরা আছে।')}
          </p>

          <Field label="কত দিনে শেষ করার কথা">
            <NumField value={days} onChange={setDays} />
          </Field>
        </div>
        <div className="actionbar">
          <button className="btn primary" disabled={!builtUp} onClick={() => setStep('material')}>{t("এগিয়ে যান")}</button>
        </div>
      </>
    )
  }

  /* ---- 3. material, with every rate open to correction ---- */
  if (step === 'material') {
    return (
      <>
        <TopBar title="মালের হিসাব" sub={tf('{0} · {1} বর্গফুট', ptype, toBn(Math.round(builtUp)))} onBack={() => setStep('size')} />
        <div className="scroll">
          <p className="hint" style={{ marginTop: '.8rem' }}>
            {t('পরিমাণ আসছে আপনার নিজের থাম্ব রুল থেকে, দর আসছে আপনি শেষবার যা দিয়েছেন তা থেকে। আজকের বাজারদর আলাদা হলে এখানেই বদলে দিন।')}
          </p>
          <div className="card">
            {lines.map((l) => (
              <div key={l.item_id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div className="spread">
                  <span className="t">{t(l.name)}</span>
                  <span className="v num">{l.known ? money(l.amount) : '—'}</span>
                </div>
                <div className="spread" style={{ marginTop: '.35rem', gap: '.6rem' }}>
                  <span className="small muted">{num(l.qty, 1)} {t(l.unit)} ×</span>
                  <div style={{ width: '9rem' }}>
                    <NumField value={rateOverride[l.item_id] ?? (l.own || null)} decimal
                      placeholder="দর"
                      onChange={(v) => setRateOverride({ ...rateOverride, [l.item_id]: v ?? 0 })} />
                  </div>
                </div>
              </div>
            ))}
            {lines.length === 0 && <p className="hint">{t("এই ধরনের জন্য কোনো থাম্ব রুল বসানো নেই।")}</p>}
            <div className="total"><span className="k">{t("মাল")}</span><span className="v num">{money(material)}</span></div>
          </div>
          {missing.length > 0 && (
            <div className="alert warn" style={{ marginTop: '.6rem' }}>
              <span className="dot" />
              <span>{tf('{0} — এই মালের দর একবারও লেখা হয়নি, তাই হিসাবে ধরা যায়নি।', missing.map((m) => t(m.name)).join(', '))}</span>
            </div>
          )}
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('size')}>{t("ফিরে")}</button>
          <button className="btn primary" onClick={() => setStep('labour')}>{t("এগিয়ে যান")}</button>
        </div>
      </>
    )
  }

  /* ---- 4. labour, counted the way he actually pays it ---- */
  if (step === 'labour') {
    return (
      <>
        <TopBar title="মজুরির হিসাব" onBack={() => setStep('material')} />
        <div className="scroll">
          <h2 className="question">{t('মজুরি কীভাবে ধরবেন?')}</h2>
          <div className="rowlist">
            <Pick on={prefs.labour_mode === 'daily'} title="রোজের হিসাবে"
              sub="কতজন মিস্ত্রি-জোগাড়ে, কতদিন, দিনে কত"
              onClick={() => savePrefs({ ...prefs, labour_mode: 'daily' })} />
            <Pick on={prefs.labour_mode === 'sqft'} title="বর্গফুটের হিসাবে"
              sub={historyLabour ? tf('আপনার আগের কাজে {0} প্রতি বর্গফুট', moneyExact(historyLabour)) : 'ঠিকা দরে কাজ দিলে'}
              onClick={() => savePrefs({ ...prefs, labour_mode: 'sqft' })} />
          </div>

          {prefs.labour_mode === 'daily' ? (
            <>
              <p className="sectionlabel">{t('কারা কাজ করবে')}</p>
              <p className="small muted" style={{ marginBottom: '.6rem' }}>
                {t('এটা এই কাজের আন্দাজ — আপনার এখনকার লোকের তালিকার সঙ্গে এর কোনো সম্পর্ক নেই।')}
              </p>
              {crew.map((c, k) => (
                <div key={c.id} className="card" style={{ marginBottom: '.6rem' }}>
                  <input className="input" placeholder={t('কী কাজ — যেমন রাজমিস্ত্রি')} value={c.name}
                    onChange={(e) => setCrew(crew.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
                  <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <NumField value={c.men} placeholder="কতজন"
                        onChange={(v) => setCrew(crew.map((x, j) => (j === k ? { ...x, men: v } : x)))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <NumField value={c.rate} placeholder="দিনে ₹"
                        onChange={(v) => setCrew(crew.map((x, j) => (j === k ? { ...x, rate: v } : x)))} />
                    </div>
                    <button className="iconbtn" aria-label={t('বাদ দিন')}
                      onClick={() => setCrew(crew.filter((x) => x.id !== c.id))}><Icon name="trash" size={18} /></button>
                  </div>
                  {(c.men || 0) > 0 && (c.rate || 0) > 0 && (days || 0) > 0 && (
                    <p className="small muted" style={{ marginTop: '.45rem' }}>
                      {tf('{0} জন × {1} দিন × {2} = {3}', toBn(c.men || 0), toBn(days || 0), money(c.rate || 0), money((c.men || 0) * (c.rate || 0) * (days || 0)))}
                    </p>
                  )}
                </div>
              ))}
              <div className="chips"><Chip onClick={addCrew}>+ কাজের লোক যোগ করুন</Chip></div>

              <Field label="কত দিন কাজ চলবে">
                <NumField value={days} onChange={setDays} />
              </Field>
              {!days && crew.length > 0 && (
                <p className="small" style={{ color: 'var(--warn)' }}>{t('দিনের সংখ্যা না বসালে মজুরি শূন্য থেকে যাবে।')}</p>
              )}
            </>
          ) : (
            <Field label={t('মজুরি প্রতি বর্গফুট') + (historyLabour ? ' ' + tf('(আগের কাজে {0})', moneyExact(historyLabour)) : '')}>
              <NumField value={prefs.labour_per_sqft ?? (historyLabour ? Math.round(historyLabour) : null)}
                onChange={(v) => savePrefs({ ...prefs, labour_per_sqft: v })} decimal />
            </Field>
          )}

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="total"><span className="k">{t('মোট মজুরি')}</span><span className="v num">{money(labour)}</span></div>
          </div>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('material')}>{t("ফিরে")}</button>
          <button className="btn primary" onClick={() => setStep('extras')}>{t("এগিয়ে যান")}</button>
        </div>
      </>
    )
  }

  /* ---- 5. everything else that costs money ---- */
  if (step === 'extras') {
    return (
      <>
        <TopBar title="অন্য খরচ" onBack={() => setStep('labour')} />
        <div className="scroll">
          <p className="hint" style={{ marginTop: '.8rem' }}>
            {t('গাড়ি ভাড়া, মেশিন, জল-বিদ্যুৎ, প্ল্যান পাশ — যা যা আলাদা লাগবে। যেগুলো লাগবে না, ছেড়ে দিন।')}
          </p>
          {foundationCost ? (
            <div className="card">
              <div className="review-row">
                <span><span className="t">{t('ভিত')}</span><span className="k">{t(foundation)}</span></span>
                <span className="v num">{money(foundationCost)}</span>
              </div>
            </div>
          ) : null}
          {extras.map((x, k) => (
            <div key={x.id} style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
              <input className="input" style={{ flex: 2 }} placeholder={t('কীসের খরচ')} value={x.name}
                onChange={(e) => setExtras(extras.map((y, j) => (j === k ? { ...y, name: e.target.value } : y)))} />
              <div style={{ flex: 1 }}>
                <NumField value={x.amount} onChange={(v) => setExtras(extras.map((y, j) => (j === k ? { ...y, amount: v } : y)))} />
              </div>
              <button className="iconbtn" aria-label={t('বাদ দিন')} onClick={() => setExtras(extras.filter((y) => y.id !== x.id))}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
          <div className="chips">
            <Chip onClick={addExtra}>+ খরচ যোগ করুন</Chip>
            {['গাড়ি ভাড়া', 'মেশিন ভাড়া', 'বিদ্যুৎ-জল', 'প্ল্যান পাশ'].map((n) => (
              <Chip key={n} onClick={() => setExtras([...extras, { id: n + Date.now(), name: n, amount: null }])}>{t(n)}</Chip>
            ))}
          </div>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('labour')}>{t("ফিরে")}</button>
          <button className="btn primary" onClick={() => setStep('margin')}>{t("এগিয়ে যান")}</button>
        </div>
      </>
    )
  }

  /* ---- 6. the margins, and the whole sum in one view ---- */
  if (step === 'margin') {
    return (
      <>
        <TopBar title="লাভ ও মোট" sub={tf('{0} · {1} বর্গফুট', ptype, toBn(Math.round(builtUp)))} onBack={() => setStep('extras')} />
        <div className="scroll">
          <div className="card">
            <Field label="অনিশ্চয়তার জন্য %"><NumField value={prefs.contingency_pct} onChange={(v) => savePrefs({ ...prefs, contingency_pct: v ?? 0 })} decimal /></Field>
            <Field label="ওভারহেড %"><NumField value={prefs.overhead_pct} onChange={(v) => savePrefs({ ...prefs, overhead_pct: v ?? 0 })} decimal /></Field>
            <Field label="লাভ %"><NumField value={prefs.profit_pct} onChange={(v) => savePrefs({ ...prefs, profit_pct: v ?? 0 })} decimal /></Field>
          </div>

          <div className="card">
            <div className="amountline"><span className="n">{t("মাল")}</span><span className="v num">{money(material)}</span></div>
            <div className="amountline"><span className="n">{t("মজুরি")}</span><span className="v num">{money(labour)}</span></div>
            {extrasCost > 0 && <div className="amountline"><span className="n">{t("অন্য খরচ")}</span><span className="v num">{money(extrasCost)}</span></div>}
            <div className="amountline"><span className="n">{tf('অনিশ্চয়তা {0}%', toBn(prefs.contingency_pct))}</span><span className="v num">{money(contingency)}</span></div>
            <div className="amountline"><span className="n">{tf('ওভারহেড {0}%', toBn(prefs.overhead_pct))}</span><span className="v num">{money(overhead)}</span></div>
            <div className="amountline"><span className="n">{tf('লাভ {0}%', toBn(prefs.profit_pct))}</span><span className="v num">{money(profit)}</span></div>
            <div className="total"><span className="k">{t("মোট")}</span><span className="v num">{money(total)}</span></div>
            <p className="small muted" style={{ marginTop: '.5rem' }}>{tf('প্রতি বর্গফুট {0}', moneyExact(builtUp ? total / builtUp : 0))}</p>
          </div>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setStep('extras')}>{t("ফিরে")}</button>
          <button className="btn primary" disabled={!total} onClick={() => setStep('quote')}>{t("দর তৈরি করুন")}</button>
        </div>
      </>
    )
  }

  const quote = quoteText({
    ptype, perFloor, floors: floors || 1, builtUp, foundation, days, client,
    material, labour, extrasCost, contingency, overhead, profit, total, prefs,
  })
  return (
    <>
      <TopBar title="দরপত্র" onBack={() => setStep('margin')} />
      <div className="scroll">
        <Field label="খদ্দেরের নাম"><input className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="যেমন — শ্রী অমিত ঘোষ" /></Field>
        <div className="card" style={{ whiteSpace: 'pre-wrap', fontSize: '.95rem', lineHeight: 1.65 }}>{quote}</div>
        <p className="small muted" style={{ marginTop: '.7rem' }}>
          {t("এটা কপি করে WhatsApp-এ পাঠাতে পারেন। ছাপা কাগজ লাগলে কম্পিউটার থেকে Google Sheet-এর হিসাব ব্যবহার করুন।")}
        </p>
      </div>
      <div className="actionbar">
        <button className="btn quiet" onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ text: quote })
            else { await navigator.clipboard.writeText(quote); toast.show('কপি হয়েছে') }
          } catch { toast.show('পাঠানো গেল না') }
        }}>
          <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}><Icon name="fwd" size={18} />{t("পাঠান")}</span>
        </button>
        <button className="btn primary" onClick={async () => { await navigator.clipboard.writeText(quote).catch(() => {}); toast.show('কপি হয়েছে') }}>{t("কপি করুন")}</button>
      </div>
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function quoteText(q: {
  ptype: string; perFloor: number; floors: number; builtUp: number; foundation: string; days: number | null
  client: string; material: number; labour: number; extrasCost: number
  contingency: number; overhead: number; profit: number; total: number; prefs: Prefs
}): string {
  const L: string[] = []
  L.push(tf('দরপত্র · {0}', dateBn(isoDate(), false)))
  if (q.client) L.push(tf('খদ্দের: {0}', q.client))
  L.push(tf('কাজ: {0} · {1} তলা · মোট {2} বর্গফুট', q.ptype, toBn(q.floors), toBn(Math.round(q.builtUp))))
  L.push(tf('ভিত: {0}', q.foundation))
  if (q.days) L.push(tf('সময়: প্রায় {0} দিন', toBn(q.days)))
  L.push('')
  L.push(tf('মাল ও সরঞ্জাম     {0}', money(q.material)))
  L.push(tf('মজুরি             {0}', money(q.labour)))
  if (q.extrasCost > 0) L.push(tf('অন্য খরচ          {0}', money(q.extrasCost)))
  L.push(tf('অনিশ্চয়তা {0}%     {1}', toBn(q.prefs.contingency_pct), money(q.contingency)))
  L.push(tf('ওভারহেড {0}%      {1}', toBn(q.prefs.overhead_pct), money(q.overhead)))
  L.push(tf('লাভ {0}%           {1}', toBn(q.prefs.profit_pct), money(q.profit)))
  L.push('—')
  L.push(tf('মোট               {0}', money(q.total)))
  L.push(tf('প্রতি বর্গফুট       {0}', moneyExact(q.builtUp ? q.total / q.builtUp : 0)))
  L.push('')
  L.push(t('শর্ত: মাল ও মজুরির দর বদলালে হিসাব বদলাতে পারে। কাজ শুরুর আগে ৩০% অগ্রিম।'))
  return L.join('\n')
}

/** His own labour cost per square foot, from jobs that have both. */
function labourPerSqft(s: State): number | null {
  const rows = projects(s)
    .filter((p) => (p.area_sqft || 0) > 0)
    .map((p) => ({ p, t: projectTotals(p, s.entries, stages(s)) }))
    .filter((r) => r.t.labour > 0 && r.t.pct_done > 25)
  if (!rows.length) return null
  const per = rows.map((r) => r.t.labour / (r.t.pct_done / 100) / (r.p.area_sqft as number))
  return per.reduce((a, b) => a + b, 0) / per.length
}

/** What he pays a man for a day, averaged over his own crew — a starting
    figure for the estimate, not a rule. */
function averageDayRate(s: State): number | null {
  const rates = workers(s).map((w) => w.rate).filter((r) => r > 0)
  if (!rates.length) return null
  return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
}
