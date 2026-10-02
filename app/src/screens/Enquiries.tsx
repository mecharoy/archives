import { useEffect, useState } from 'react'
import { Icon, TopBar, Empty } from '../ui/kit'
import { useStore } from '../lib/store'
import { fetchEnquiries, markEnquiriesSeen, telHref, whatsappHref, unseenIds, type Enquiry } from '../lib/enquiries'
import { agoBn, dateBn, isoDate } from '../lib/bn'
import { t, tf } from '../lib/i18n'

/* Questions and call-back requests from the public website, each with a number
   he can ring or message with one tap. Read-only: the phone only remembers
   which ones he has already seen. Opening this screen counts as seeing them,
   but the ones that were new when he opened it stay marked, so he can tell
   which to ring first. */

export function Enquiries({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [fresh] = useState(() => new Set(unseenIds()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setBusy(true)
    setError(await fetchEnquiries(false))
    setBusy(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line
  // Everything on screen has been seen — including what arrives while it is open.
  useEffect(() => { void markEnquiriesSeen() }, [s.enquiries.length])

  return (
    <>
      <TopBar title="ওয়েবসাইটের অনুসন্ধান" onBack={onBack}
        right={<button className="iconbtn" onClick={load} aria-label={t('নতুন করে আনুন')} style={{ opacity: busy ? .5 : 1 }}><Icon name="refresh" /></button>} />
      <div className="scroll">
        {error && <div className="alert warn" style={{ marginTop: '.8rem' }}><span className="dot" /><span>{error}</span></div>}

        {s.enquiries.length === 0 && !busy && !error && (
          <Empty>{t('এখনও ওয়েবসাইট থেকে কেউ লেখেনি।')}<br />{t('কেউ লিখলে এখানে ফোন নম্বর সহ দেখা যাবে — অ্যাপ খোলা থাকলে।')}</Empty>
        )}

        {s.enquiries.map((e) => <Card key={e.id} e={e} isNew={fresh.has(e.id)} />)}
      </div>
    </>
  )
}

function Card({ e, isNew }: { e: Enquiry; isNew: boolean }) {
  const tel = telHref(e.phone)
  const wa = whatsappHref(e.phone)
  const when = new Date(e.received_at)
  return (
    <div className="card" style={{ marginTop: '.8rem' }}>
      <div className="spread">
        <strong>{e.name}</strong>
        <span className="small muted">{isNew && <span className="badge ok" style={{ marginRight: '.4rem' }}>{t('নতুন')}</span>}{agoBn(e.received_at)}</span>
      </div>
      <p className="small muted" style={{ marginTop: '.2rem' }}>{dateBn(isoDate(when), false)}</p>
      {e.service && <p className="small" style={{ marginTop: '.4rem' }}>{tf('যা চান: {0}', e.service)}</p>}
      {e.location && <p className="small">{tf('এলাকা: {0}', e.location)}</p>}
      {e.message && <p style={{ marginTop: '.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.message}</p>}
      <div className="actionbar" style={{ borderTop: 0, padding: '.7rem 0 0' }}>
        {tel && <a className="btn primary" href={tel} style={{ textDecoration: 'none', textAlign: 'center' }}>{t('ফোন করুন')} · {e.phone}</a>}
        {wa && <a className="btn ghost" href={wa} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', textAlign: 'center' }}>{t('হোয়াটসঅ্যাপ')}</a>}
      </div>
    </div>
  )
}
