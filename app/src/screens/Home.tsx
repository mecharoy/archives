import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon, Sheet } from '../ui/kit'
import { telHref } from '../lib/phone'
import { useStore, activeProjects, workers, stages, type State, type Brief } from '../lib/store'
import { money, toBn, isoDate, agoBn, dayLabelBn, addDays, daysBetween } from '../lib/bn'
import { localBrief, briefIsStale, fetchBrief, monthSpend } from '../lib/brief'
import { maybeMakeBrief } from '../lib/aiBrief'
import { cashState, projectTotals, daysWritten, lastEntryDate, shopStock, shopEverHandled, duesSplit, receivablesSplit } from '../lib/calc'
import { lastAttendance, lastAttendanceDay, lastDayFor, rankProjects } from '../lib/suggest'
import { newDraft, DAYS_FOR, type Draft } from '../lib/draft'
import { allItems } from '../lib/store'
import { flush } from '../lib/sync'
import { t, tf, pick } from '../lib/i18n'
import { fetchEnquiries } from '../lib/enquiries'
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
  const [help, setHelp] = useState(false)

  // The server's brief (written by the PC job) is always looked at; it only
  // replaces what the phone holds when it is newer and has words. With a key
  // in Settings the phone also writes its own once a day (see aiBrief.ts) and
  // checks again whenever the app comes back to the front. Typing a key in
  // Settings starts it at once, because this effect depends on the key.
  const hasKey = !!s.settings.ai_key.trim()

  /* Questions from the public website. Looked for whenever the app is opened
     or comes back to the front; there is no push, so this is how he finds out. */
  useEffect(() => {
    void fetchEnquiries()
    const onShow = () => { if (!document.hidden) void fetchEnquiries() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])
  const newEnquiries = s.enquiries.filter((e) => !s.enquiries_seen.includes(e.id)).length

  useEffect(() => {
    if (s.settings.briefUrl || s.settings.endpoint) void fetchBrief()
    if (!hasKey) return
    void maybeMakeBrief()
    const onShow = () => { if (!document.hidden) void maybeMakeBrief() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [hasKey]) // eslint-disable-line

  const stale = briefIsStale(s.brief)
  const brief: Brief = useMemo(() => (s.brief && !stale ? s.brief : localBrief()), [s.brief, stale, s.entries, s.masters])

  const sameDraft = useMemo(() => buildSameAsYesterday(s), [s])
  const doneToday = useMemo(() => s.entries.some((e) => e.date === isoDate() && e.kind === 'day'), [s.entries])
  const last = lastEntryDate(s.entries)
  const gap = last && last < addDays(isoDate(), -1)

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchBrief(true), fetchEnquiries(), hasKey ? maybeMakeBrief() : Promise.resolve(), flush(true)])
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
            {t('আজ পর্যন্ত')}
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

        {/* Only drawn when someone has written from the website and he has not
            looked yet — a customer waiting for a call is worth a line here. */}
        {newEnquiries > 0 && (
          <button className="bigbtn" style={{ marginTop: '.6rem' }} onClick={() => onGo('enquiries')}>
            <Icon name="phone" size={26} stroke={1.7} />
            <span style={{ flex: 1 }}>
              <span className="t" style={{ display: 'block' }}>{tf('ওয়েবসাইটে {0} জন লিখেছেন', toBn(newEnquiries))}</span>
              <span className="s">{t('ফোন নম্বর সহ — ফোন করুন')}</span>
            </span>
            <Icon name="fwd" size={22} />
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

        {/* What to look at today, straight under the day's entry. */}
        {brief.alerts && brief.alerts.length > 0 && (
          <>
            <p className="sectionlabel">{t('নজর দেওয়ার মতো')}</p>
            {brief.alerts.slice(0, 4).map((a, k) => (
              <div className={'alert ' + a.severity} key={k}><span className="dot" /><span>{pick(a.text_bn, a.text_en)}</span></div>
            ))}
          </>
        )}

        {brief.todo_bn && brief.todo_bn.length > 0 && (
          <>
            <p className="sectionlabel">{t('আজ যা করবেন')}</p>
            <div className="card">
              {brief.todo_bn.slice(0, 4).map((x, k) => (
                <div key={k} className="todo"><span className="n num">{toBn(k + 1)}</span><span>{pick(x, brief.todo_en?.[k])}</span></div>
              ))}
            </div>
          </>
        )}

        {/* The three books, one plain line each; the detail is one tap inside. Each keeps its colour so
            the eye finds কাজ, মজুত and হিসাব by hue before it reads a word. */}
        <div data-tour="books" style={{ marginTop: '1.2rem' }}>
          <WorkSummary s={s} onGo={onGo} />
          <StockSummary s={s} onGo={onGo} />
          <MoneySummary s={s} onGo={onGo} />
        </div>

        <div className="spread" style={{ marginTop: '1rem', gap: '.6rem' }}>
          <button className="btn quiet" data-tour="all" style={{ flex: 1 }} onClick={() => onGo('all')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}><Icon name="grid" size={20} />{t('সব কিছু')}</span>
          </button>
          <button className="btn quiet" style={{ flex: 1 }} onClick={() => setHelp(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}><Icon name="phone" size={20} />{t('সাহায্য')}</span>
          </button>
        </div>
      </div>

      <StandingTotals s={s} onGo={onGo} />
      <UpdateModal />
      {help && <HelpSheet s={s} onClose={() => setHelp(false)} />}
    </>
  )
}

/* সাহায্য: the evening in three lines, how to chase money, and the person to ring. */
function HelpSheet({ s, onClose }: { s: State; onClose: () => void }) {
  const name = s.settings.helper_name.trim()
  const tel = telHref(s.settings.helper_phone)
  return (
    <Sheet title="সাহায্য" onClose={onClose}>
      <p className="sectionlabel" style={{ marginTop: 0 }}>{t('রোজ সন্ধেবেলা')}</p>
      <div className="card">
        <div className="todo"><span className="n num">{toBn(1)}</span><span>{t('‘আজকের হিসাব’-এ চাপুন।')}</span></div>
        <div className="todo"><span className="n num">{toBn(2)}</span><span>{t('প্রশ্নগুলোর উত্তর দিন — কিছু না থাকলে ‘না’।')}</span></div>
        <div className="todo"><span className="n num">{toBn(3)}</span><span>{t('শেষে ‘খাতায় তুলুন’ চাপুন।')}</span></div>
      </div>
      <p className="sectionlabel">{t('কেউ টাকা দেননি?')}</p>
      <p>{t('নিচে ‘পাবেন’-এ চাপুন, তারপর নামের নিচে ‘তাগাদা পাঠান’।')}</p>
      {tel
        ? <a className="btn primary" href={tel} style={{ display: 'block', marginTop: '1rem', textAlign: 'center', textDecoration: 'none' }}>{tf('{0} কে ফোন করুন', name || t('সাহায্যকারী'))}</a>
        : <p className="small muted" style={{ marginTop: '1rem' }}>{t('সেটিংস → নাম ও ফোন-এ যিনি সাহায্য করবেন তাঁর নম্বর দিন।')}</p>}
    </Sheet>
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

function WorkSummary({ s, onGo }: { s: State; onGo: (x: Screen) => void }) {
  const act = activeProjects(s)
  const topId = rankProjects(s.entries, act.map((p) => p.id))[0]
  const top = act.find((p) => p.id === topId) || act[0]
  const pct = top ? Math.round(projectTotals(top, s.entries, stages(s)).pct_done) : 0
  return (
    <BookCard tone="work" icon="chart" title="কাজ" onOpen={() => onGo('work')}>
      <p className="booknote">{top
        ? tf('{0} কাজ চলছে · {1} {2}%', toBn(act.length), top.name_bn, toBn(pct))
        : t('এখনও কোনো কাজ যোগ করা হয়নি। ভিতরে গিয়ে কাজ যোগ করুন।')}</p>
    </BookCard>
  )
}

/* ---------- মজুত ---------- */

function StockSummary({ s, onGo }: { s: State; onGo: (x: Screen) => void }) {
  const levels = useMemo(() => shopStock(s.entries, allItems(s)), [s.entries, s.masters])
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const value = levels.reduce((a, l) => a + l.value, 0)
  return (
    <BookCard tone="stock" icon="shop" title="মজুত" onOpen={() => onGo('shop')}>
      <p className="booknote">{levels.length === 0
        ? (shopEverHandled(s.entries)
          ? t('দোকানের সব মাল শেষ। নতুন মাল তুললে ‘মাল এসেছে’ থেকে লিখুন।')
          : t('এখনও কোনো মাল ঢোকেনি। ভিতরে গিয়ে ‘মাল এসেছে’ থেকে শুরু করুন।'))
        : tf('মজুত {0} · দোকানে বাকি {1}', money(value), money(dues.total))}</p>
    </BookCard>
  )
}

/* ---------- হিসাব ---------- */

function MoneySummary({ s, onGo }: { s: State; onGo: (x: Screen) => void }) {
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const spend = useMemo(() => monthSpend(s.entries), [s.entries])
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0
  return (
    <BookCard tone="money" icon="wallet" title="হিসাব" onOpen={() => onGo('money')}>
      <p className="booknote">{tf('হাতে {0} · এ মাসের খরচ {1}', counted ? money(cash.computed) : '—', money(spend))}</p>
    </BookCard>
  )
}

/* Whether the book has reached the online ledger, and how many days were written this week. It lives in
   Settings now: on the home screen it was one more line to read every evening. */
export function SyncLine({ s }: { s: State }) {
  const pending = s.outbox.length
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const days = daysWritten(s.entries, 7)
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0
  return (
    <>
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
        {t('গত সাত দিনে')} {toBn(days)} {t('দিন হিসাব লেখা হয়েছে')}{counted ? ` · ${t('হাতে')} ${money(cash.computed)}` : ''}
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
  // The crew of the last day BEFORE today, and only if that was recent: offering "the same as yesterday"
  // for a crew last seen last week would tick men who may long since have gone.
  const att = lastAttendance(s.entries, pid, isoDate())
  const seen = lastAttendanceDay(s.entries, pid, isoDate())
  if (!att.size || !seen || daysBetween(seen, isoDate()) > 3) return null
  const men = workers(s)
  const d = newDraft(isoDate(), pid)
  d.from_yesterday = true
  for (const [wid, presence] of att) {
    const w = men.find((x) => x.id === wid)
    if (!w) continue
    d.att[wid] = { presence, rate: w.rate, amount: w.rate * DAYS_FOR[presence], advance: 0 }
  }
  if (!Object.keys(d.att).length) return null
  // No cash count is invented here: a count is something he does with the money in his hand.
  d.step = 999
  return d
}

export function projectLines(s: State) {
  return activeProjects(s).map((p) => projectTotals(p, s.entries, stages(s)))
}
