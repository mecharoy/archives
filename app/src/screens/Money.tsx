import { useMemo } from 'react'
import { Icon, TopBar } from '../ui/kit'
import { useStore, nameOf, type Brief } from '../lib/store'
import { money, isoDate } from '../lib/bn'
import { localBrief, briefIsStale, monthSpend } from '../lib/brief'
import { cashState, duesSplit } from '../lib/calc'
import { t, pick } from '../lib/i18n'
import type { Screen } from '../App'

/* হিসাব — the money book. What is in the tin, what went this month, who is
   owed what, and the night's to-do — then every money thing he might do:
   settle a bill or take a payment, his own private book, count the cash,
   look back over old days. Reading and doing in the same place. */
export function Money({ onBack, onGo }: { onBack: () => void; onGo: (s: Screen) => void }) {
  const s = useStore((x) => x)
  const stale = briefIsStale(s.brief)
  const brief: Brief = useMemo(() => (s.brief && !stale ? s.brief : localBrief()), [s.brief, stale, s.entries, s.masters])
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const dues = useMemo(() => duesSplit(s.entries), [s.entries])
  const spend = useMemo(() => monthSpend(s.entries), [s.entries])
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0

  return (
    <>
      <TopBar title="হিসাব" onBack={onBack} />
      <div className="scroll">
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

        <p className="sectionlabel">{t('এই খাতার কাজ')}</p>
        <div className="tilegrid">
          <Tile icon="wallet" title="টাকা দেওয়া-নেওয়া" sub="বাকি মেটানো, পাওনা তোলা" onClick={() => onGo('payments')} />
          <Tile icon="lock" title="নিজের খরচ" sub="আলাদা খাতা" onClick={() => onGo('personal')} />
          <Tile icon="calc" title="হাতের টাকা গোনা" sub="নতুন করে বসানো" onClick={() => onGo('cash')} />
          <Tile icon="clock" title="পুরোনো হিসাব" sub="দেখা ও সংশোধন" onClick={() => onGo('history')} />
        </div>
      </div>
    </>
  )
}

function Tile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="tile" onClick={onClick}>
      <Icon name={icon} size={24} stroke={1.6} />
      <span><span className="t" style={{ display: 'block' }}>{t(title)}</span><span className="s">{t(sub)}</span></span>
    </button>
  )
}
