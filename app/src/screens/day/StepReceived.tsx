import { useState } from 'react'
import { Icon } from '../../ui/kit'
import { money } from '../../lib/bn'
import { modeLabel } from '../../lib/calc'
import { ReceivedForm } from '../Received'
import { t } from '../../lib/i18n'
import type { SiteProps } from './common'

/* এই কাজের টাকা পেলেন? — money that came in for this job today, in cash or online. The lines live on the day
   (each carrying its job), so money written at the cash count for another job sits beside them. */
export function StepReceived({ s, draft, site, patch, next }: SiteProps) {
  const pid = draft.sites[site].project_id
  const lines = draft.recv.filter((r) => r.project_id === pid)
  const [adding, setAdding] = useState(false)
  if (adding) {
    return <ReceivedForm s={s} defaultProject={pid} fixed onBack={() => setAdding(false)}
      onAdd={(r) => { patch({ recv: [...draft.recv, r] }); setAdding(false) }} />
  }
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('এই কাজের টাকা পেলেন?')}</h2>
        {lines.length > 0 && (
          <div className="card" style={{ marginBottom: '.9rem' }}>
            {lines.map((r) => (
              <div key={r.key} className="review-row">
                <span><span className="t">{t('টাকা পেলাম')}</span><span className="k">{modeLabel(r.mode)}</span></span>
                <span className="v num">{money(r.amount)}</span>
                <button className="iconbtn" onClick={() => patch({ recv: draft.recv.filter((x) => x.key !== r.key) })} aria-label={t('বাদ দিন')}><Icon name="trash" size={18} /></button>
              </div>
            ))}
            <div className="total"><span className="k">{t('মোট পেলেন')}</span><span className="v num">{money(lines.reduce((a, r) => a + r.amount, 0))}</span></div>
          </div>
        )}
        {lines.length > 0
          ? <button className="btn quiet" style={{ width: '100%' }} onClick={() => setAdding(true)}>{t('আরও টাকা')}</button>
          : (
            <div className="yesno">
              <button onClick={next}>{t('না')}</button>
              <button className="on" onClick={() => setAdding(true)}>{t('হ্যাঁ')}</button>
            </div>
          )}
      </div>
      {lines.length > 0 && <div className="actionbar"><button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button></div>}
    </>
  )
}
