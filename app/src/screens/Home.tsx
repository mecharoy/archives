import { useEffect, useMemo } from 'react'
import { Icon } from '../ui/kit'
import { TabBar, type Tab } from '../ui/TabBar'
import { telHref } from '../lib/phone'
import { useStore, nameOf, parties, saveSettings, type State } from '../lib/store'
import { money, toBn, isoDate, dateBn, dayLabelBn, addDays } from '../lib/bn'
import { currentBrief, fetchBrief } from '../lib/brief'
import { maybeMakeBrief } from '../lib/aiBrief'
import { cashState, daysWritten, lastEntryDate, owedByPerson } from '../lib/calc'
import { t, tf, pick } from '../lib/i18n'
import { fetchEnquiries } from '../lib/enquiries'
import { UpdateCard, UpdateModal } from '../ui/UpdateCard'
import type { Screen } from '../App'

/* আজ — the first tab, and the calmest page in the app. Four things, in the order he needs them: the day's few
   lines (Google's, written in the background, or the phone's own), the one big button for today's entry, who
   owes him money with a call button beside each, and a card only when something needs him — the first count
   of the shop, people who wrote on the website, a newer build, days left unwritten. At the foot, the helper's
   number. Everything else lives in its own tab. */

export function Home({ onDay, onGo, onTab }: { onDay: () => void; onGo: (screen: Screen) => void; onTab: (t: Tab) => void }) {
  const s = useStore((x) => x)
  const hasKey = !!s.settings.ai_key.trim()

  /* Questions from the public website, looked for whenever the app is opened or comes back to the front. */
  useEffect(() => {
    void fetchEnquiries()
    const onShow = () => { if (!document.hidden) void fetchEnquiries() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  /* The day's lines: the server's brief is looked at; with a Google key the phone writes its own once a day
     (aiBrief.ts), again whenever the app comes back to the front. Nothing to press. */
  useEffect(() => {
    if (s.settings.briefUrl || s.settings.endpoint) void fetchBrief()
    if (!hasKey) return
    void maybeMakeBrief()
    const onShow = () => { if (!document.hidden) void maybeMakeBrief() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [hasKey]) // eslint-disable-line

  const brief = useMemo(() => currentBrief(), [s.brief, s.entries, s.masters]) // eslint-disable-line
  const doneToday = useMemo(() => s.entries.some((e) => e.date === isoDate() && e.kind === 'day'), [s.entries])
  const owed = useMemo(() => owedByPerson(s.entries).slice(0, 3), [s.entries])
  const last = lastEntryDate(s.entries)
  const gap = !!last && last < addDays(isoDate(), -1)
  const newEnquiries = s.enquiries.filter((e) => !s.enquiries_seen.includes(e.id)).length
  const askCount = s.settings.runs_shop && !s.settings.full_count_at && isoDate() >= (s.settings.count_later_until || '')
  const helper = s.settings.helper_name.trim()
  const helperTel = telHref(s.settings.helper_phone)

  return (
    <>
      <div className="topbar">
        <h1>{t('সাইট খাতা')}<span className="sub">{dateBn(isoDate())}</span></h1>
        <button className="iconbtn" onClick={() => onGo('settings')} aria-label={t('সেটিংস')}><Icon name="gear" /></button>
      </div>

      <div className="scroll">
        <div className="say" data-tour="brief">
          <span className="saylabel">{t('আজকের কথা')}</span>
          <p className="headline">{pick(brief.headline_bn, brief.headline_en)}</p>
        </div>

        <button className="bigbtn" data-tour="today" onClick={onDay}>
          <Icon name="edit" size={28} stroke={1.7} />
          <span style={{ flex: 1 }}>
            <span className="t" style={{ display: 'block' }}>{doneToday ? t('আজকের হিসাব লেখা হয়েছে') : t('আজকের হিসাব লিখুন')}</span>
            {doneToday && <span className="s">{t('কিছু বাদ গেলে যোগ করুন')}</span>}
          </span>
          <Icon name="fwd" size={22} />
        </button>

        {owed.length > 0 && (
          <div data-tour="owed">
            <p className="sectionlabel">{t('টাকা পাবেন')}</p>
            <div className="rowlist">
              {owed.map((o) => <OwedRow key={o.party_id || 'none'} s={s} party={o.party_id} amount={o.amount} since={o.since} />)}
            </div>
            <button className="btn quiet small" style={{ marginTop: '.5rem' }} onClick={() => onTab('money')}>{t('সবাইকে দেখুন')}</button>
          </div>
        )}

        {askCount && (
          <div className="softcard">
            <strong>{t('দোকানের মাল একবার গুনে লিখুন')}</strong>
            <span>{t('তাহলে দোকানে কী আছে, ঠিক দেখাবে।')}</span>
            <span className="pair">
              <button className="btn primary small" onClick={() => onGo('fullcount')}>{t('শুরু করি')}</button>
              <button className="btn ghost small" onClick={() => void saveSettings({ count_later_until: addDays(isoDate(), 7) })}>{t('পরে')}</button>
            </span>
          </div>
        )}

        {newEnquiries > 0 && (
          <button className="softcard enq" onClick={() => onGo('enquiries')}>
            <strong>{tf('ওয়েবসাইটে {0} জন খোঁজ নিয়েছেন', toBn(newEnquiries))}</strong>
          </button>
        )}

        {/* Only ever drawn when the repository actually has something newer. */}
        <UpdateCard />

        {gap && (
          <button className="softcard" onClick={() => onGo('history')}>
            <strong>{tf('শেষ হিসাব {0}। বাদ পড়া দিন লিখুন', dayLabelBn(last!))}</strong>
          </button>
        )}

        {helperTel && (
          <a className="helpline" href={helperTel}>
            <Icon name="phone" size={18} />{tf('সাহায্য লাগলে — {0}কে ফোন করুন', helper || t('সাহায্যকারী'))}
          </a>
        )}
      </div>

      <TabBar />
      <UpdateModal />
    </>
  )
}

/* One person who owes him: the name, since when, how much, and a call button when there is a number. */
function OwedRow({ s, party, amount, since }: { s: State; party: string; amount: number; since: string }) {
  const p = parties(s).find((x) => x.id === party)
  const tel = p ? telHref(p.phone) : ''
  return (
    <div className="owedrow">
      <span className="who">
        <span className="t">{party ? nameOf(s, party) : t('খুচরো খদ্দের')}</span>
        <span className="s">{tf('{0} থেকে', dateBn(since, false))}</span>
      </span>
      <span className="v num">{money(amount)}</span>
      {tel ? <a className="call" href={tel} aria-label={t('ফোন')}><Icon name="phone" size={18} /></a> : <span className="call none" />}
    </div>
  )
}

/* Whether the book has reached the online ledger, and how many days were written this week. Shown in
   Settings: on the home screen it was one more line to read every evening. */
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
