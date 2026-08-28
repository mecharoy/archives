import { useEffect, useMemo, useState } from 'react'
import { Icon, TopBar, Chip, MoneyPad, Field, NumField, useToast, Toast, Empty } from '../ui/kit'
import { useStore, items, coeffs, stages, projects, type State } from '../lib/store'
import { kvGet, kvSet } from '../lib/db'
import { money, moneyExact, toBn, num, dateBn, isoDate } from '../lib/bn'
import { projectTotals } from '../lib/calc'
import { lastPurchase } from '../lib/suggest'
import { t, tf } from '../lib/i18n'

/* No model here, and none needed: quantities come from his own coefficients,
   rates from his own last purchase, labour from what his own finished jobs
   actually cost per square foot. The nightly brief is where the coefficients
   get corrected — this screen only multiplies. */

interface Prefs { labour_per_sqft: number | null; overhead_pct: number; profit_pct: number }
const DEFAULT_PREFS: Prefs = { labour_per_sqft: null, overhead_pct: 5, profit_pct: 12 }

export function Estimator({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [step, setStep] = useState<'type' | 'area' | 'numbers' | 'quote'>('type')
  const [ptype, setPtype] = useState('')
  const [area, setArea] = useState('')
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [client, setClient] = useState('')
  const toast = useToast()

  useEffect(() => { void kvGet<Prefs>('estimate_prefs', DEFAULT_PREFS).then(setPrefs) }, [])
  const savePrefs = (p: Prefs) => { setPrefs(p); void kvSet('estimate_prefs', p) }

  const types = useMemo(() => [...new Set(stages(s).map((x) => x.project_type))], [s.masters])
  const historyLabour = useMemo(() => labourPerSqft(s), [s])
  const areaN = Number(area) || 0

  const lines = useMemo(() => {
    const cs = coeffs(s).filter((c) => c.project_type === ptype)
    return cs.map((c) => {
      const it = items(s).find((i) => i.id === c.item_id)
      const qty = c.per_sqft * areaN
      // What he actually paid last time beats whatever is on the master row.
      const rate = lastPurchase(s.entries, c.item_id)?.rate ?? it?.last_rate ?? 0
      return { item_id: c.item_id, name: it?.name_bn || '—', unit: it?.unit_bn || '', qty, rate, amount: qty * rate, known: rate > 0 }
    })
  }, [s, ptype, areaN])

  const material = lines.reduce((a, l) => a + l.amount, 0)
  const labourRate = prefs.labour_per_sqft ?? historyLabour
  const labour = (labourRate ?? 0) * areaN
  const direct = material + labour
  const overhead = (direct * prefs.overhead_pct) / 100
  const profit = ((direct + overhead) * prefs.profit_pct) / 100
  const total = direct + overhead + profit
  const missing = lines.filter((l) => !l.known)

  if (step === 'type') {
    return (
      <>
        <TopBar title="নতুন কাজের হিসাব" onBack={onBack} />
        <div className="scroll">
          <h2 className="question">{t("কী ধরনের কাজ?")}</h2>
          {types.length === 0 && (
            <Empty>{t("এখনও কোনো ধরন ঠিক করা নেই।")}<br />{t("সেটিংস → ধাপ ও থাম্ব রুল থেকে একবার বসিয়ে নিলে এই হিসাব কাজ করবে।")}</Empty>
          )}
          <div className="chips">
            {types.map((t) => <Chip key={t} on={ptype === t} onClick={() => { setPtype(t); setStep('area') }}>{t}</Chip>)}
          </div>
        </div>
      </>
    )
  }

  if (step === 'area') {
    return (
      <>
        <TopBar title={ptype} onBack={() => setStep('type')} />
        <div className="scroll">
          <h2 className="question">{t("কত স্কোয়ার ফুট?")}</h2>
          <p className="hint">{t("মোট বিল্ট-আপ মাপ। পরে বদলাতে পারবেন।")}</p>
          <MoneyPad value={area} onChange={setArea} prefix="" />
        </div>
        <div className="actionbar">
          <button className="btn primary" disabled={!areaN} onClick={() => setStep('numbers')}>{t("এগিয়ে যান")}</button>
        </div>
      </>
    )
  }

  if (step === 'numbers') {
    return (
      <>
        <TopBar title="হিসাব" sub={tf('{0} · {1} বর্গফুট', ptype, toBn(areaN))} onBack={() => setStep('area')} />
        <div className="scroll">
          <p className="sectionlabel">{t("মালের হিসাব")}</p>
          <div className="card">
            {lines.map((l) => (
              <div className="review-row" key={l.item_id}>
                <span>
                  <span className="t">{l.name}</span>
                  <span className="k">{num(l.qty, 1)} {l.unit} × {l.known ? moneyExact(l.rate) : t('দর জানা নেই')}</span>
                </span>
                <span className="v num">{l.known ? money(l.amount) : '—'}</span>
              </div>
            ))}
            {lines.length === 0 && <p className="hint">{t("এই ধরনের জন্য কোনো থাম্ব রুল বসানো নেই।")}</p>}
            <div className="total"><span className="k">{t("মাল")}</span><span className="v num">{money(material)}</span></div>
          </div>
          {missing.length > 0 && (
            <div className="alert warn" style={{ marginTop: '.6rem' }}>
              <span className="dot" />
              <span>{missing.map((m) => m.name).join(', ')} — এই মালের দর একবারও লেখা হয়নি, তাই হিসাবে ধরা যায়নি।</span>
            </div>
          )}

          <p className="sectionlabel">{t("মজুরি ও বাকি")}</p>
          <div className="card">
            <Field label={`মজুরি প্রতি বর্গফুট${historyLabour ? ` (আগের কাজে ${moneyExact(historyLabour)})` : ''}`}>
              <NumField value={prefs.labour_per_sqft ?? (historyLabour ? Math.round(historyLabour) : null)}
                onChange={(v) => savePrefs({ ...prefs, labour_per_sqft: v })} decimal />
            </Field>
            <Field label="ওভারহেড %"><NumField value={prefs.overhead_pct} onChange={(v) => savePrefs({ ...prefs, overhead_pct: v ?? 0 })} decimal /></Field>
            <Field label="লাভ %"><NumField value={prefs.profit_pct} onChange={(v) => savePrefs({ ...prefs, profit_pct: v ?? 0 })} decimal /></Field>
          </div>

          <div className="card">
            <div className="amountline"><span className="n">{t("মাল")}</span><span className="v num">{money(material)}</span></div>
            <div className="amountline"><span className="n">{t("মজুরি")}</span><span className="v num">{money(labour)}</span></div>
            <div className="amountline"><span className="n">ওভারহেড {toBn(prefs.overhead_pct)}%</span><span className="v num">{money(overhead)}</span></div>
            <div className="amountline"><span className="n">লাভ {toBn(prefs.profit_pct)}%</span><span className="v num">{money(profit)}</span></div>
            <div className="total"><span className="k">{t("মোট")}</span><span className="v num">{money(total)}</span></div>
            <p className="small muted" style={{ marginTop: '.5rem' }}>প্রতি বর্গফুট {moneyExact(areaN ? total / areaN : 0)}</p>
          </div>
        </div>
        <div className="actionbar">
          <button className="btn primary" disabled={!total} onClick={() => setStep('quote')}>{t("দর তৈরি করুন")}</button>
        </div>
      </>
    )
  }

  const quote = quoteText({ ptype, area: areaN, client, material, labour, overhead, profit, total, prefs })
  return (
    <>
      <TopBar title="দরপত্র" onBack={() => setStep('numbers')} />
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
  ptype: string; area: number; client: string; material: number; labour: number
  overhead: number; profit: number; total: number; prefs: Prefs
}): string {
  const L: string[] = []
  L.push(tf('দরপত্র · {0}', dateBn(isoDate(), false)))
  if (q.client) L.push(tf('খদ্দের: {0}', q.client))
  L.push(tf('কাজ: {0} · {1} বর্গফুট', q.ptype, toBn(q.area)))
  L.push('')
  L.push(tf('মাল ও সরঞ্জাম     {0}', money(q.material)))
  L.push(tf('মজুরি             {0}', money(q.labour)))
  L.push(tf('ওভারহেড {0}%      {1}', toBn(q.prefs.overhead_pct), money(q.overhead)))
  L.push(tf('লাভ {0}%           {1}', toBn(q.prefs.profit_pct), money(q.profit)))
  L.push('—')
  L.push(tf('মোট               {0}', money(q.total)))
  L.push(tf('প্রতি বর্গফুট       {0}', moneyExact(q.area ? q.total / q.area : 0)))
  L.push('')
  L.push('শর্ত: মাল ও মজুরির দর বদলালে হিসাব বদলাতে পারে। কাজ শুরুর আগে ৩০% অগ্রিম।')
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

