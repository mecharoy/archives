import { useEffect, useMemo, useState } from 'react'
import { Icon, Empty } from '../ui/kit'
import { SCurve, BurnBars } from '../ui/charts'
import { useStore, activeProjects, workers, stages, items, allItems, nameOf, type State, type Brief } from '../lib/store'
import { money, toBn, num, agoBn, dayLabelBn, isoDate, addDays } from '../lib/bn'
import { localBrief, briefIsStale, fetchBrief, monthSpend } from '../lib/brief'
import { cashState, projectTotals, entriesInLastDays, lastEntryDate, shopStock, duesSplit, receivablesSplit } from '../lib/calc'
import { lastAttendance, lastDayFor, rankProjects } from '../lib/suggest'
import { newDraft, DAYS_FOR, type Draft } from '../lib/draft'
import { flush } from '../lib/sync'
import { t, pick } from '../lib/i18n'

/* The home screen is three books on one shelf: কাজ (the sites), মজুত (the
   shop) and হিসাব (the money). He is only ever in one of them at a time, and
   the thing he does every evening — today's entry — sits above all three so
   it is never behind a tab.

   Everything above the tabs is judgement: tonight's headline and the alerts.
   Everything inside a tab is arithmetic, and it is his own — the phone's sums
   over his own rows, so a night without a brief costs him nothing. */

type Tab = 'work' | 'stock' | 'money'

export function Home({ onDay, onSameAsYesterday, onGo }: {
  onDay: () => void
  onSameAsYesterday: (d: Draft) => void
  onGo: (screen: 'shop' | 'personal' | 'estimate' | 'settings' | 'history' | 'project' | 'payments') => void
}) {
  const s = useStore((x) => x)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>(s.settings.runs_sites ? 'work' : 'stock')

  // The brief lives on the same server as the rows, so an endpoint alone is
  // enough — briefUrl is only an override for hosting it somewhere else.
  useEffect(() => { if (s.settings.briefUrl || s.settings.endpoint) void fetchBrief() }, []) // eslint-disable-line

  const stale = briefIsStale(s.brief)
  const brief: Brief = useMemo(() => (s.brief && !stale ? s.brief : localBrief()), [s.brief, stale, s.entries, s.masters])
  const usingLocal = !s.brief || stale

  const sameDraft = useMemo(() => buildSameAsYesterday(s), [s])
  const doneToday = useMemo(() => s.entries.some((e) => e.date === isoDate() && e.kind === 'day'), [s.entries])
  const last = lastEntryDate(s.entries)
  const gap = last && last < addDays(isoDate(), -1)

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchBrief(false), flush(true)])
    setRefreshing(false)
  }

  const hour = new Date().getHours()
  const partOfDay = hour < 12 ? 'সকাল' : hour < 17 ? 'দুপুর' : 'সন্ধে'
  const who = s.settings.owner_bn.trim()

  return (
    <>
      <div className="topbar">
        <h1>{t('সাইট খাতা')}<span className="sub">{dayLabelBn(isoDate())}, {t(partOfDay)}</span></h1>
        <button className="iconbtn" onClick={refresh} aria-label={t('নতুন করে আনুন')}
          style={{ opacity: refreshing ? .5 : 1 }}><Icon name="refresh" /></button>
        <button className="iconbtn" data-tour="settings" onClick={() => onGo('settings')} aria-label={t('সেটিংস')}><Icon name="gear" /></button>
      </div>

      <div className="scroll">
        <div className="hero" data-tour="brief">
          <p className="greet">
            {who ? `${who} · ` : ''}
            {usingLocal ? t('ফোনের নিজের হিসাব') : `${t('রাতের হিসাব')} · ${agoBn(brief.generated_at)}`}
          </p>
          <p className="headline">{pick(brief.headline_bn, brief.headline_en)}</p>
        </div>

        {stale && s.brief && (
          <div className="alert warn" style={{ marginBottom: '.8rem' }}>
            <span className="dot" />
            <span>{t('পুরোনো হিসাব')} — {agoBn(s.brief.generated_at)}। {t('নিচের সংখ্যাগুলো ফোনের নিজের হিসাব।')}</span>
          </div>
        )}

        <button className="bigbtn" data-tour="today" onClick={onDay}>
          <Icon name="book" size={30} stroke={1.6} />
          <span style={{ flex: 1 }}>
            <span className="t" style={{ display: 'block' }}>{t('আজকের হিসাব')}</span>
            <span className="s">{doneToday ? t('আজকের হিসাব লেখা হয়েছে — আরও যোগ করতে পারেন') : t('কয়েকটা প্রশ্ন, তারপর শেষ')}</span>
          </span>
          <Icon name="fwd" size={22} />
        </button>

        {sameDraft && !doneToday && (
          <button className="btn quiet" style={{ width: '100%', marginTop: '.6rem', minHeight: '3.4rem' }}
            onClick={() => onSameAsYesterday(sameDraft)}>
            {t('কালকের মতোই')} · {toBn(Object.keys(sameDraft.att).length)} {t('জন')}, {money(Object.values(sameDraft.att).reduce((a, x) => a + x.amount, 0))}
          </button>
        )}

        {gap && (
          <div className="alert warn" style={{ marginTop: '.8rem' }}>
            <span className="dot" />
            <span>{t('শেষ হিসাব')} {dayLabelBn(last!)}। {t('মাঝের দিনগুলো লিখতে চাইলে ‘পুরোনো হিসাব’ থেকে তারিখ বেছে নিন।')}</span>
          </div>
        )}

        {brief.alerts && brief.alerts.length > 0 && (
          <>
            <p className="sectionlabel">{t('নজর দেওয়ার মতো')}</p>
            {brief.alerts.slice(0, 4).map((a, k) => (
              <div className={'alert ' + a.severity} key={k}><span className="dot" /><span>{pick(a.text_bn, a.text_en)}</span></div>
            ))}
          </>
        )}

        <div className="tabs" data-tour="tabs">
          <button className={'tab' + (tab === 'work' ? ' on' : '')} onClick={() => setTab('work')}>{t('কাজ')}</button>
          <button className={'tab' + (tab === 'stock' ? ' on' : '')} onClick={() => setTab('stock')}>{t('মজুত')}</button>
          <button className={'tab' + (tab === 'money' ? ' on' : '')} onClick={() => setTab('money')}>{t('হিসাব')}</button>
        </div>

        {tab === 'work' && <WorkTab s={s} brief={brief} onGo={onGo} />}
        {tab === 'stock' && <StockTab s={s} onGo={onGo} />}
        {tab === 'money' && <MoneyTab s={s} brief={brief} onGo={onGo} />}

        <SyncLine s={s} />
      </div>

      <StandingTotals s={s} onGo={onGo} />
    </>
  )
}

/* ---------- কাজ ---------- */

function WorkTab({ s, brief, onGo }: { s: State; brief: Brief; onGo: (x: 'estimate' | 'project' | 'history') => void }) {
  const act = activeProjects(s)
  const rows = brief.projects ?? []
  return (
    <>
      {act.length === 0 && (
        <Empty>{t('এখনও কোনো কাজ যোগ করা হয়নি। কাজ এলে এখানে অগ্রগতি আর খরচ পাশাপাশি দেখা যাবে।')}</Empty>
      )}

      {rows.length > 0 && (
        <>
          <p className="sectionlabel">{t('কাজের অবস্থা')}</p>
          <div className="card">
            {rows.map((p, k) => (
              <div key={k} style={{ padding: '.55rem 0', borderBottom: k < rows.length - 1 ? '1px solid var(--line-soft)' : 0 }}>
                <div className="spread">
                  <strong>{pick(p.name_bn, p.name_en)}</strong>
                  <span className={'badge ' + (p.status || 'ok')}>{pick(p.note_bn, p.note_en)}</span>
                </div>
                <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
                  <span className="name small muted">{t('কাজ')}</span>
                  <span className="bartrack"><span className="barfill" style={{ width: `${Math.min(100, p.pct_done)}%` }} /></span>
                  <span className="pct num">{toBn(Math.round(p.pct_done))}%</span>
                </div>
                <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
                  <span className="name small muted">{t('খরচ')}</span>
                  <span className="bartrack"><span className={'barfill ' + (p.pct_spent > p.pct_done + 6 ? 'warn' : '')}
                    style={{ width: `${Math.min(100, p.pct_spent)}%` }} /></span>
                  <span className="pct num">{toBn(Math.round(p.pct_spent))}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {brief.series?.scurve && (
        <>
          <p className="sectionlabel">{t('খরচ আর পরিকল্পনা')}</p>
          <div className="card"><SCurve data={brief.series.scurve} /></div>
        </>
      )}

      {brief.series?.burn && brief.series.burn.length > 0 && (
        <>
          <p className="sectionlabel">{t('মাল কত গেল')}</p>
          <div className="card">
            <BurnBars rows={brief.series.burn} done={brief.projects?.[0]?.pct_done ?? 0} />
          </div>
        </>
      )}

      <div className="tilegrid">
        <button className="tile" onClick={() => onGo('estimate')}>
          <Icon name="calc" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('নতুন কাজের হিসাব')}</span><span className="s">{t('দর দেওয়ার আগে')}</span></span>
        </button>
        <button className="tile" onClick={() => onGo('project')}>
          <Icon name="people" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('কাজ আর লোক')}</span><span className="s">{t('যোগ করা, বদলানো')}</span></span>
        </button>
      </div>
    </>
  )
}

/* ---------- মজুত ---------- */

function StockTab({ s, onGo }: { s: State; onGo: (x: 'shop' | 'project') => void }) {
  const levels = useMemo(() => shopStock(s.entries, allItems(s)), [s.entries, s.masters])
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const value = levels.reduce((a, l) => a + l.value, 0)
  const low = levels.filter((l) => l.qty <= 0)

  return (
    <>
      <div className="statgrid">
        <div className="stat info">
          <span className="k">{t('মজুতের দাম')}</span>
          <span className="v num">{money(value)}</span>
          <span className="s">{toBn(levels.length)} {t('রকম মাল')}</span>
        </div>
        <div className={'stat ' + (dues.overdue > 0 ? 'crit' : dues.total > 0 ? 'warn' : 'ok')}>
          <span className="k">{t('দোকানে বাকি')}</span>
          <span className="v num">{money(dues.total)}</span>
          <span className="s">{dues.overdue > 0 ? `${money(dues.overdue)} ${t('সময় পেরিয়েছে')}` : t('সময়ের মধ্যে')}</span>
        </div>
      </div>

      {levels.length === 0 && <Empty>{t('এখনও কোনো মাল ঢোকেনি। ‘মাল এসেছে’ থেকে শুরু করুন।')}</Empty>}

      {levels.length > 0 && (
        <>
          <p className="sectionlabel">{t('এখন যা আছে')}</p>
          <div className="card">
            {levels.slice(0, 8).map((l) => {
              const it = items(s).find((i) => i.id === l.item_id)
              return (
                <div className="review-row" key={l.item_id}>
                  <span>
                    <span className="t">{t(nameOf(s, l.item_id))}</span>
                    <span className="k">{money(l.rate)} {t('দরে')}</span>
                  </span>
                  <span className="v num" style={{ color: l.qty < 0 ? 'var(--crit)' : undefined }}>
                    {num(l.qty, l.qty % 1 ? 2 : 0)} {t(it?.unit_bn || '')}
                  </span>
                </div>
              )
            })}
            {levels.length > 8 && <div className="review-row"><span className="k">{t('আরও')} {toBn(levels.length - 8)}</span></div>}
          </div>
        </>
      )}

      {low.length > 0 && (
        <div className="alert warn" style={{ marginTop: '.6rem' }}>
          <span className="dot" />
          <span>{toBn(low.length)} {t('রকম মাল শেষ বা মাইনাসে — একবার গুনে নিন।')}</span>
        </div>
      )}

      <div className="tilegrid">
        <button className="tile" onClick={() => onGo('shop')}>
          <Icon name="shop" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('দোকানের মজুত')}</span><span className="s">{t('মাল ঢোকা, বিক্রি, গোনা')}</span></span>
        </button>
        <button className="tile" onClick={() => onGo('project')}>
          <Icon name="book" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('মালের তালিকা')}</span><span className="s">{t('নাম, একক, শেষ দর')}</span></span>
        </button>
      </div>
    </>
  )
}

/* ---------- হিসাব ---------- */

function MoneyTab({ s, brief, onGo }: { s: State; brief: Brief; onGo: (x: 'personal' | 'history' | 'project' | 'payments') => void }) {
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const spend = useMemo(() => monthSpend(s.entries), [s.entries])
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0

  return (
    <>
      <div className="statgrid">
        <div className={'stat ' + (cash.computed < 0 ? 'crit' : 'ok')}>
          <span className="k">{t('হাতে টাকা')}</span>
          <span className="v num">{counted ? money(cash.computed) : '—'}</span>
          <span className="s">{counted ? t('শেষ গোনা থেকে') : t('একবার গুনে বসিয়ে দিন')}</span>
        </div>
        <div className="stat info">
          <span className="k">{t('এ মাসের খরচ')}</span>
          <span className="v num">{money(spend)}</span>
          <span className="s">{t('চলতি মাস')}</span>
        </div>
      </div>

      {dues.all.length > 0 && (
        <>
          <p className="sectionlabel">{t('কাকে কত দিতে হবে')}</p>
          <div className="card">
            {dues.all.slice(0, 6).map((d) => (
              <div className="review-row" key={d.entry_id}>
                <span>
                  <span className="t">{d.party_id ? nameOf(s, d.party_id) : t('নাম লেখা নেই')}</span>
                  <span className="k">{t(nameOf(s, d.item_id))} · {d.due_date < isoDate() ? t('সময় পেরিয়েছে') : d.due_date}</span>
                </span>
                <span className="v num" style={{ color: d.due_date < isoDate() ? 'var(--crit)' : undefined }}>{money(d.amount)}</span>
              </div>
            ))}
            <div className="total"><span className="k">{t('মোট বাকি')}</span><span className="v num">{money(dues.total)}</span></div>
          </div>
        </>
      )}

      {brief.todo_bn && brief.todo_bn.length > 0 && (
        <>
          <p className="sectionlabel">{t('যা করতে হবে')}</p>
          <div className="card">
            {brief.todo_bn.map((x, k) => (
              <div key={k} className="review-row"><span className="t">{pick(x, brief.todo_en?.[k])}</span></div>
            ))}
          </div>
        </>
      )}

      <div className="tilegrid">
        <button className="tile" onClick={() => onGo('payments')}>
          <Icon name="wallet" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('টাকা দেওয়া-নেওয়া')}</span><span className="s">{t('বাকি মেটানো, পাওনা তোলা')}</span></span>
        </button>
        <button className="tile" onClick={() => onGo('personal')}>
          <Icon name="wallet" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('নিজের খরচ')}</span><span className="s">{t('আলাদা খাতা')}</span></span>
        </button>
        <button className="tile" onClick={() => onGo('history')}>
          <Icon name="clock" size={24} stroke={1.6} />
          <span><span className="t" style={{ display: 'block' }}>{t('পুরোনো হিসাব')}</span><span className="s">{t('দেখা ও সংশোধন')}</span></span>
        </button>
      </div>
    </>
  )
}

function SyncLine({ s }: { s: State }) {
  const pending = s.outbox.length
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const days = entriesInLastDays(s.entries, 7)
  return (
    <>
      <div className="divider" />
      <div className="statusline">
        <span className={'dotlive' + (!s.online ? ' off' : pending ? ' pending' : '')} />
        <span>
          {!s.settings.endpoint
            ? t('শুধু ফোনে রাখা হচ্ছে')
            : pending
              ? `${toBn(pending)} ${t('লাইন পাঠানো বাকি')}${s.online ? '' : ' — ' + t('নেট এলে যাবে')}`
              : t('সব খাতায় উঠে গেছে')}
        </span>
      </div>
      <p className="small muted">
        {t('গত সাত দিনে')} {toBn(days)} {t('দিন হিসাব লেখা হয়েছে')} · {t('হাতে')} {money(cash.computed)}
        {s.sync_error ? ` · ${s.sync_error}` : ''}
      </p>
    </>
  )
}

/* The three numbers he actually carries in his head, kept on screen wherever
   he is: what is in the tin, what is owed to him, what he owes. Tapping the
   second or third opens the screen that settles it. */
function StandingTotals({ s, onGo }: { s: State; onGo: (x: 'payments') => void }) {
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const get = useMemo(() => receivablesSplit(s.entries), [s.entries])
  const owe = useMemo(() => duesSplit(s.entries), [s.entries])
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0
  return (
    <div className="footbar" data-tour="standing">
      <div className="foot">
        <span className="k">{t('হাতে')}</span>
        <span className="v num">{counted ? money(cash.computed) : '—'}</span>
      </div>
      <button className="foot" onClick={() => onGo('payments')}>
        <span className="k">{t('পাবেন')}</span>
        <span className={'v num' + (get.overdue > 0 ? ' warn' : '')}>{money(get.total)}</span>
      </button>
      <button className="foot" onClick={() => onGo('payments')}>
        <span className="k">{t('দেবেন')}</span>
        <span className={'v num' + (owe.overdue > 0 ? ' crit' : '')}>{money(owe.total)}</span>
      </button>
    </div>
  )
}

/** কালকের মতোই — the last day on the site he touched most recently, with the
    men and their wages carried over. Materials and one-off expenses are not
    copied: repeating a purchase he did not make is the one wrong guess that
    would cost him money. */
export function buildSameAsYesterday(s: State): Draft | null {
  const act = activeProjects(s)
  if (!act.length) return null
  const pid = rankProjects(s.entries, act.map((p) => p.id))[0]
  if (!pid) return null
  const prev = lastDayFor(s.entries, pid)
  if (!prev) return null
  const att = lastAttendance(s.entries, pid)
  if (!att.size) return null
  const men = workers(s)
  const d = newDraft(isoDate(), pid)
  d.from_yesterday = true
  for (const [wid, presence] of att) {
    const w = men.find((x) => x.id === wid)
    if (!w) continue
    d.att[wid] = { presence, rate: w.rate, amount: w.rate * DAYS_FOR[presence], advance: 0 }
  }
  if (!Object.keys(d.att).length) return null
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const wages = Object.values(d.att).reduce((a, x) => a + x.amount, 0)
  d.cash_counted = Math.round(cash.computed - wages)
  d.step = 999
  return d
}

export function projectLines(s: State) {
  return activeProjects(s).map((p) => projectTotals(p, s.entries, stages(s)))
}
