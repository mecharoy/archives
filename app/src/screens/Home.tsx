import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../ui/kit'
import { SCurve, BurnBars } from '../ui/charts'
import { useStore, activeProjects, workers, stages, type State, type Brief } from '../lib/store'
import { money, toBn, agoBn, dayLabelBn, isoDate, addDays } from '../lib/bn'
import { localBrief, briefIsStale, fetchBrief } from '../lib/brief'
import { cashState, projectTotals, entriesInLastDays, lastEntryDate } from '../lib/calc'
import { lastAttendance, lastDayFor, rankProjects } from '../lib/suggest'
import { newDraft, DAYS_FOR, type Draft } from '../lib/draft'
import { flush } from '../lib/sync'

export function Home({ onDay, onSameAsYesterday, onGo }: {
  onDay: () => void
  onSameAsYesterday: (d: Draft) => void
  onGo: (screen: 'shop' | 'personal' | 'estimate' | 'settings' | 'history' | 'project') => void
}) {
  const s = useStore((x) => x)
  const [refreshing, setRefreshing] = useState(false)

  // The brief now lives on the same server as the rows, so an endpoint alone
  // is enough — briefUrl is only an override for hosting it somewhere else.
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

  return (
    <>
      <div className="topbar">
        <h1>Site Khata<span className="sub">{dayLabelBn(isoDate())}, {new Date().getHours() < 12 ? 'সকাল' : new Date().getHours() < 17 ? 'দুপুর' : 'সন্ধে'}</span></h1>
        <button className="iconbtn" onClick={refresh} aria-label="নতুন করে আনুন"
          style={{ opacity: refreshing ? .5 : 1 }}><Icon name="refresh" /></button>
        <button className="iconbtn" onClick={() => onGo('settings')} aria-label="সেটিংস"><Icon name="gear" /></button>
      </div>

      <div className="scroll">
        <div className="hero">
          <p className="greet">{usingLocal ? 'ফোনের নিজের হিসাব' : `রাতের হিসাব · ${agoBn(brief.generated_at)}`}</p>
          <p className="headline">{brief.headline_bn}</p>
        </div>

        {stale && s.brief && (
          <div className="alert warn" style={{ marginBottom: '.8rem' }}>
            <span className="dot" />
            <span>পুরোনো হিসাব — {agoBn(s.brief.generated_at)} তৈরি। নিচের সংখ্যাগুলো ফোনের নিজের হিসাব।</span>
          </div>
        )}

        <button className="bigbtn" onClick={onDay}>
          <Icon name="book" size={30} stroke={1.6} />
          <span style={{ flex: 1 }}>
            <span className="t" style={{ display: 'block' }}>আজকের হিসাব</span>
            <span className="s">{doneToday ? 'আজকের হিসাব লেখা হয়েছে — আরও যোগ করতে পারেন' : 'কয়েকটা প্রশ্ন, তারপর শেষ'}</span>
          </span>
          <Icon name="fwd" size={22} />
        </button>

        {sameDraft && !doneToday && (
          <button className="btn quiet" style={{ width: '100%', marginTop: '.6rem', minHeight: '3.4rem' }}
            onClick={() => onSameAsYesterday(sameDraft)}>
            কালকের মতোই · {toBn(Object.keys(sameDraft.att).length)} জন, {money(Object.values(sameDraft.att).reduce((a, x) => a + x.amount, 0))}
          </button>
        )}

        {gap && (
          <div className="alert warn" style={{ marginTop: '.8rem' }}>
            <span className="dot" />
            <span>শেষ হিসাব {dayLabelBn(last!)}। মাঝের দিনগুলো লিখতে চাইলে ‘পুরোনো হিসাব’ থেকে তারিখ বেছে নিন।</span>
          </div>
        )}

        {brief.cards && brief.cards.length > 0 && (
          <>
            <p className="sectionlabel">এক নজরে</p>
            <div className="statgrid">
              {brief.cards.slice(0, 4).map((c) => (
                <div className={'stat ' + (c.status || 'info')} key={c.label_bn}>
                  <span className="k">{c.label_bn}</span>
                  <span className="v num">{c.value}</span>
                  {c.sub_bn && <span className="s">{c.sub_bn}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {brief.alerts && brief.alerts.length > 0 && (
          <>
            <p className="sectionlabel">নজর দেওয়ার মতো</p>
            {brief.alerts.slice(0, 4).map((a, k) => (
              <div className={'alert ' + a.severity} key={k}><span className="dot" /><span>{a.text_bn}</span></div>
            ))}
          </>
        )}

        {brief.projects && brief.projects.length > 0 && (
          <>
            <p className="sectionlabel">কাজের অবস্থা</p>
            <div className="card">
              {brief.projects.map((p, k) => (
                <div key={k} style={{ padding: '.55rem 0', borderBottom: k < brief.projects!.length - 1 ? '1px solid var(--line-soft)' : 0 }}>
                  <div className="spread">
                    <strong>{p.name_bn}</strong>
                    <span className={'badge ' + (p.status || 'ok')}>{p.note_bn || ''}</span>
                  </div>
                  <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
                    <span className="name small muted">কাজ</span>
                    <span className="bartrack"><span className="barfill" style={{ width: `${Math.min(100, p.pct_done)}%` }} /></span>
                    <span className="pct num">{toBn(Math.round(p.pct_done))}%</span>
                  </div>
                  <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
                    <span className="name small muted">খরচ</span>
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
            <p className="sectionlabel">খরচ আর পরিকল্পনা</p>
            <div className="card"><SCurve data={brief.series.scurve} /></div>
          </>
        )}

        {brief.series?.burn && brief.series.burn.length > 0 && (
          <>
            <p className="sectionlabel">মাল কত গেল</p>
            <div className="card">
              <BurnBars rows={brief.series.burn} done={brief.projects?.[0]?.pct_done ?? 0} />
            </div>
          </>
        )}

        {brief.todo_bn && brief.todo_bn.length > 0 && (
          <>
            <p className="sectionlabel">যা করতে হবে</p>
            <div className="card">
              {brief.todo_bn.map((t, k) => (
                <div key={k} className="review-row"><span className="t">{t}</span></div>
              ))}
            </div>
          </>
        )}

        <p className="sectionlabel">আরও</p>
        <div className="tilegrid">
          <button className="tile" onClick={() => onGo('shop')}>
            <Icon name="shop" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>দোকানের মজুত</span><span className="s">মাল ঢোকা, বিক্রি, গোনা</span></span>
          </button>
          <button className="tile" onClick={() => onGo('personal')}>
            <Icon name="wallet" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>নিজের খরচ</span><span className="s">আলাদা খাতা</span></span>
          </button>
          <button className="tile" onClick={() => onGo('estimate')}>
            <Icon name="calc" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>নতুন কাজের হিসাব</span><span className="s">দর দেওয়ার আগে</span></span>
          </button>
          <button className="tile" onClick={() => onGo('history')}>
            <Icon name="clock" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>পুরোনো হিসাব</span><span className="s">দেখা ও সংশোধন</span></span>
          </button>
        </div>

        <SyncLine s={s} />
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
            ? 'শুধু ফোনে রাখা হচ্ছে'
            : pending
              ? `${toBn(pending)}টা লাইন পাঠানো বাকি${s.online ? '' : ' — নেট এলে যাবে'}`
              : 'সব খাতায় উঠে গেছে'}
        </span>
      </div>
      <p className="small muted">
        গত সাত দিনে {toBn(days)} দিন হিসাব লেখা হয়েছে · হাতে {money(cash.computed)}
        {s.sync_error ? ` · ${s.sync_error}` : ''}
      </p>
    </>
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
