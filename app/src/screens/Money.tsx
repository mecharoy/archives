import { useMemo, useState } from 'react'
import { Icon, Pick, Toast, useToast, Empty } from '../ui/kit'
import { TabBar } from '../ui/TabBar'
import { ReceivedSheet } from './Received'
import { OldDueSheet } from './OldDue'
import { SettleSheet, byParty } from './Payments'
import { ContactPicker } from './Settings'
import { useStore, nameOf, parties, activeProjects, saveMaster } from '../lib/store'
import { money, isoDate, dateBn } from '../lib/bn'
import { monthSpend } from '../lib/brief'
import { cashState, openDues, openReceivables } from '../lib/calc'
import { telHref } from '../lib/phone'
import { reminderText, reminderHref } from '../lib/dues'
import type { ID } from '../lib/model'
import { t, tf } from '../lib/i18n'
import type { Screen } from '../App'

/* টাকা — cash and dues on one page. The three figures he carries in his head: in hand, owed to him, owed by
   him. Then who owes him, each with a call and a ready-written তাগাদা on WhatsApp — collecting is the thing he
   most needs the book for; tapping a name writes what they paid. Then whom he owes, late ones in red; tapping
   writes what he paid. His own book is one tap, behind its passcode. The rarer things sit under আরও. */
export function Money({ onGo }: { onGo: (s: Screen) => void }) {
  const s = useStore((x) => x)
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const counted = s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0
  const spend = useMemo(() => monthSpend(s.entries), [s.entries])
  const get = useMemo(() => byParty(openReceivables(s.entries)), [s.entries])
  const owe = useMemo(() => byParty(openDues(s.entries)), [s.entries])
  const getTotal = get.reduce((a, x) => a + x.amount, 0)
  const oweTotal = owe.reduce((a, x) => a + x.amount, 0)
  const [pay, setPay] = useState<{ party_id: ID; dir: 'paid' | 'received'; owed: number } | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [old, setOld] = useState(false)
  const [bookFor, setBookFor] = useState<ID | null>(null)
  const toast = useToast()
  const today = isoDate()

  return (
    <>
      <div className="topbar">
        <h1>{t('টাকা')}<span className="sub">{tf('এ মাসে খরচ {0}', money(spend))}</span></h1>
      </div>
      <div className="scroll">
        <div className="figures">
          <div><span className="k">{t('হাতে')}</span><span className="v num">{counted ? money(cash.computed) : '—'}</span></div>
          <div><span className="k">{t('পাবেন')}</span><span className="v num get">{money(getTotal)}</span></div>
          <div><span className="k">{t('দেবেন')}</span><span className="v num owe">{money(oweTotal)}</span></div>
        </div>

        <p className="sectionlabel">{t('টাকা পাবেন')}</p>
        {get.length === 0 && <Empty>{t('এখন কারও কাছে টাকা পাওনা নেই।')}</Empty>}
        <div className="rowlist">
          {get.map((x) => {
            const p = parties(s).find((pp) => pp.id === x.party_id)
            return (
              <div key={'g' + x.party_id}>
                <Pick title={x.party_id ? nameOf(s, x.party_id) : t('খুচরো খদ্দের')}
                  sub={(x.old ? t('পুরোনো বাকি') + ' · ' : '') + (!x.oldest ? tf('{0} থেকে', dateBn(x.since, false)) : x.oldest < today ? tf('{0} থেকে পাওনা — সময় পেরিয়েছে', dateBn(x.oldest, false)) : tf('{0} তারিখে পাওয়ার কথা', dateBn(x.oldest, false)))}
                  right={<span className="num">{money(x.amount)}</span>}
                  onClick={() => setPay({ party_id: x.party_id, dir: 'received', owed: x.amount })} />
                {p && (
                  <div className="spread" style={{ gap: '.5rem', margin: '.35rem 0 .8rem' }}>
                    {p.phone ? (
                      <>
                        <a className="btn ghost small" href={telHref(p.phone)} style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>{t('ফোন')}</a>
                        <a className="btn primary small" target="_blank" rel="noopener noreferrer" style={{ flex: 2, textDecoration: 'none', textAlign: 'center' }}
                          href={reminderHref(p.phone, reminderText(p.name_bn, x.since, x.amount, s.settings.owner_bn))}>{t('তাগাদা পাঠান')}</a>
                      </>
                    ) : (
                      <button className="btn ghost small" style={{ flex: 1 }} onClick={() => setBookFor(p.id)}>{t('নম্বর নেই — ফোনবুক থেকে নিন')}</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="sectionlabel">{t('টাকা দেবেন')}</p>
        {owe.length === 0 && <Empty>{t('এখন কাউকে টাকা দেওয়ার নেই।')}</Empty>}
        <div className="rowlist">
          {owe.map((x) => {
            const late = !!x.oldest && x.oldest < today
            return (
              <Pick key={'o' + x.party_id} title={x.party_id ? nameOf(s, x.party_id) : t('নাম লেখা নেই')}
                sub={<span style={{ color: late ? 'var(--crit)' : undefined }}>{(x.old ? t('পুরোনো বাকি') + ' · ' : '') + (!x.oldest ? t('তারিখ ঠিক করা নেই') : late ? t('দেওয়ার তারিখ পেরিয়েছে') : tf('{0} তারিখে দিতে হবে', dateBn(x.oldest, false)))}</span>}
                right={<span className="num" style={{ color: late ? 'var(--crit)' : undefined }}>{money(x.amount)}</span>}
                onClick={() => setPay({ party_id: x.party_id, dir: 'paid', owed: x.amount })} />
            )
          })}
        </div>

        <div className="tilegrid" style={{ marginTop: '1.1rem' }}>
          {activeProjects(s).length > 0 && (
            <button className="tile money" onClick={() => setReceiving(true)}>
              <Icon name="wallet" size={24} stroke={1.6} />
              <span><span className="t" style={{ display: 'block' }}>{t('টাকা পেলাম')}</span><span className="s">{t('কাজের টাকা এল')}</span></span>
            </button>
          )}
          <button className="tile money" onClick={() => onGo('personal')}>
            <Icon name="lock" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>{t('নিজের খরচ')}</span><span className="s">{t('আলাদা খাতা')}</span></span>
          </button>
          {/* Three tiles would leave one alone on a row: the last then takes the whole row. */}
          <button className={'tile money' + (activeProjects(s).length > 0 ? ' wide' : '')} onClick={() => onGo('cash')}>
            <Icon name="calc" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>{t('হাতের টাকা গুনুন')}</span><span className="s">{t('নতুন করে বসানো')}</span></span>
          </button>
        </div>

        <p className="sectionlabel">{t('আরও')}</p>
        <div className="rowlist">
          <Pick title="কাগজের খাতার পুরোনো বাকি" right={<Icon name="fwd" size={18} />} onClick={() => setOld(true)} />
          <Pick title="পুরোনো দিনের হিসাব" right={<Icon name="fwd" size={18} />} onClick={() => onGo('history')} />
        </div>
      </div>
      <TabBar />
      {pay && <SettleSheet s={s} {...pay} onClose={() => setPay(null)} onDone={(msg) => { setPay(null); toast.show(msg) }} />}
      {old && <OldDueSheet s={s} onClose={() => setOld(false)} onDone={(msg) => { setOld(false); toast.show(msg) }} />}
      {receiving && <ReceivedSheet s={s} onClose={() => setReceiving(false)} onDone={(msg) => { setReceiving(false); toast.show(msg) }} />}
      {bookFor && (
        <ContactPicker onClose={() => setBookFor(null)} onPicked={async (c) => {
          const p = parties(s).find((pp) => pp.id === bookFor)
          if (p) await saveMaster({ ...p, phone: c.phone, updated_at: new Date().toISOString() })
          setBookFor(null)
        }} />
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}
