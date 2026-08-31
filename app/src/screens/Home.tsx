import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '../ui/kit'
import { useStore, activeProjects, workers, stages, type State, type Brief } from '../lib/store'
import { money, toBn, isoDate, agoBn, dayLabelBn, addDays } from '../lib/bn'
import { localBrief, briefIsStale, fetchBrief, monthSpend } from '../lib/brief'
import { cashState, projectTotals, entriesInLastDays, lastEntryDate, shopStock, duesSplit, receivablesSplit } from '../lib/calc'
import { lastAttendance, lastDayFor, rankProjects } from '../lib/suggest'
import { newDraft, DAYS_FOR, type Draft } from '../lib/draft'
import { allItems } from '../lib/store'
import { flush } from '../lib/sync'
import { t, pick } from '../lib/i18n'
import { UpdateCard, UpdateModal } from '../ui/UpdateCard'
import type { Screen } from '../App'

/* The home screen is one calm page, not a set of tabs. The thing he does
   every evening — today's entry — sits at the top. Under it, the night's
   headline and anything worth his attention. Then the three books —
   কাজ (sites), মজুত (shop), হিসাব (money) — each showing its own headline
   figures right here, with a ‘দেখুন’ that opens the whole book, where he both
   reads the detail and adds or changes things. Nothing is hidden behind a tab
   he has to remember to press; the summaries of all three are always in view.
   At the very bottom, one button opens every single thing the app can do. */

export function Home({ onDay, onSameAsYesterday, onGo }: {
  onDay: () => void
  onSameAsYesterday: (d: Draft) => void
  onGo: (screen: Screen) => void
}) {
  const s = useStore((x) => x)
  const [refreshing, setRefreshing] = useState(false)

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
        <button className="iconbtn" onClick={() => onGo('settings')} aria-label={t('সেটিংস')}><Icon name="gear" /></button>
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

        {/* Only ever drawn when the repository actually has something newer. */}
        <UpdateCard />

        {gap && (
          <div className="alert warn" style={{ marginTop: '.8rem' }}>
            <span className="dot" />
            <span>{t('শেষ হিসাব')} {dayLabelBn(last!)}। {t('মাঝের দিনগুলো লিখতে চাইলে ‘পুরোনো হিসাব’ থেকে তারিখ বেছে নিন।')}</span>
          </div>
        )}

        {/* The three books, each with its headline figures in view and a way
            into the whole book. Order follows what he runs, but all are shown
            — he told us he uses all three, and hiding one behind a tap is the
            scattering we are undoing. Each carries its own colour so the eye
            finds কাজ, মজুত and হিসাব by hue before it reads a word. */}
        <div data-tour="books" style={{ marginTop: '1.2rem' }}>
          <WorkSummary s={s} brief={brief} onGo={onGo} />
          <StockSummary s={s} onGo={onGo} />
          <MoneySummary s={s} onGo={onGo} />
        </div>

        {/* What to look at today, kept under the books rather than above them —
            he asked for it here, and it reads better as a footnote to the
            three summaries than as a banner over them. */}
        {brief.alerts && brief.alerts.length > 0 && (
          <>
            <p className="sectionlabel">{t('নজর দেওয়ার মতো')}</p>
            {brief.alerts.slice(0, 4).map((a, k) => (
              <div className={'alert ' + a.severity} key={k}><span className="dot" /><span>{pick(a.text_bn, a.text_en)}</span></div>
            ))}
          </>
        )}

        <button className="bigbtn allbtn" data-tour="all" onClick={() => onGo('all')} style={{ marginTop: '1.1rem' }}>
          <Icon name="grid" size={28} stroke={1.7} />
          <span style={{ flex: 1 }}>
            <span className="t" style={{ display: 'block' }}>{t('সব কিছু')}</span>
            <span className="s">{t('অ্যাপের সব কাজ এক জায়গায়')}</span>
          </span>
          <Icon name="fwd" size={22} />
        </button>

        <SyncLine s={s} />
      </div>

      <StandingTotals s={s} onGo={onGo} />
      <UpdateModal />
    </>
  )
}

/* A book on the shelf: its name, a ‘দেখুন’ into the whole thing, and its
   headline figures underneath. Tapping anywhere on it opens the book. */
function BookCard({ tone, icon, title, onOpen, children }: {
  tone: 'work' | 'stock' | 'money'; icon: string; title: string; onOpen: () => void; children: ReactNode
}) {
  return (
    <div className={'bookcard ' + tone}>
      <button className="bookhead" onClick={onOpen}>
        <span className="name"><span className="bookicon"><Icon name={icon} size={20} stroke={1.7} /></span>{t(title)}</span>
        <span className="see">{t('দেখুন')} <Icon name="fwd" size={16} /></span>
      </button>
      <button className="bookbody" onClick={onOpen}>{children}</button>
    </div>
  )
}

/* ---------- কাজ ---------- */

function WorkSummary({ s, brief, onGo }: { s: State; brief: Brief; onGo: (x: Screen) => void }) {
  const act = activeProjects(s)
  const rows = brief.projects ?? []
  const top = rows[0]
  return (
    <BookCard tone="work" icon="chart" title="কাজ" onOpen={() => onGo('work')}>
      {act.length === 0 ? (
        <p className="booknote">{t('এখনও কোনো কাজ যোগ করা হয়নি। ভিতরে গিয়ে কাজ যোগ করুন।')}</p>
      ) : top ? (
        <>
          <div className="spread">
            <strong>{pick(top.name_bn, top.name_en)}</strong>
            <span className={'badge ' + (top.status || 'ok')}>{pick(top.note_bn, top.note_en)}</span>
          </div>
          <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
            <span className="name small muted">{t('কাজ')}</span>
            <span className="bartrack"><span className="barfill" style={{ width: `${Math.min(100, top.pct_done)}%` }} /></span>
            <span className="pct num">{toBn(Math.round(top.pct_done))}%</span>
          </div>
          <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
            <span className="name small muted">{t('খরচ')}</span>
            <span className="bartrack"><span className={'barfill ' + (top.pct_spent > top.pct_done + 6 ? 'warn' : '')}
              style={{ width: `${Math.min(100, top.pct_spent)}%` }} /></span>
            <span className="pct num">{toBn(Math.round(top.pct_spent))}%</span>
          </div>
          {rows.length > 1 && <p className="booknote">{t('আরও')} {toBn(rows.length - 1)} {t('কাজ চলছে')}</p>}
        </>
      ) : (
        <p className="booknote">{toBn(act.length)} {t('কাজ চলছে')} · {t('ভিতরে অগ্রগতি ও খরচ')}</p>
      )}
    </BookCard>
  )
}

/* ---------- মজুত ---------- */

function StockSummary({ s, onGo }: { s: State; onGo: (x: Screen) => void }) {
  const levels = useMemo(() => shopStock(s.entries, allItems(s)), [s.entries, s.masters])
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const value = levels.reduce((a, l) => a + l.value, 0)
  const low = levels.filter((l) => l.qty <= 0)
  return (
    <BookCard tone="stock" icon="shop" title="মজুত" onOpen={() => onGo('shop')}>
      {levels.length === 0 ? (
        <p className="booknote">{t('এখনও কোনো মাল ঢোকেনি। ভিতরে গিয়ে ‘মাল এসেছে’ থেকে শুরু করুন।')}</p>
      ) : (
        <>
          <div className="miniline">
            <span><span className="k">{t('মজুতের দাম')}</span><span className="v num">{money(value)}</span></span>
            <span><span className="k">{t('দোকানে বাকি')}</span>
              <span className={'v num' + (dues.overdue > 0 ? ' crit' : dues.total > 0 ? ' warn' : '')}>{money(dues.total)}</span></span>
          </div>
          <p className="booknote">
            {toBn(levels.length)} {t('রকম মাল')}
            {low.length > 0 ? ` · ${toBn(low.length)} ${t('রকম শেষ বা মাইনাসে')}` : ''}
          </p>
        </>
      )}
    </BookCard>
  )
}

/* ---------- হিসাব ---------- */

function MoneySummary({ s, onGo }: { s: State; onGo: (x: Screen) => void }) {
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const spend = useMemo(() => monthSpend(s.entries), [s.entries])
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0
  return (
    <BookCard tone="money" icon="wallet" title="হিসাব" onOpen={() => onGo('money')}>
      <div className="miniline">
        <span><span className="k">{t('হাতে টাকা')}</span><span className={'v num' + (cash.computed < 0 ? ' crit' : '')}>{counted ? money(cash.computed) : '—'}</span></span>
        <span><span className="k">{t('এ মাসের খরচ')}</span><span className="v num">{money(spend)}</span></span>
      </div>
      <p className="booknote">
        {dues.total > 0 ? `${t('দোকানে বাকি')} ${money(dues.total)}` : t('কোনো বাকি নেই')}
        {' · '}{t('ভিতরে টাকা দেওয়া-নেওয়া, নিজের খরচ')}
      </p>
    </BookCard>
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
function StandingTotals({ s, onGo }: { s: State; onGo: (x: Screen) => void }) {
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
