import { Fragment, useState } from 'react'
import { Icon } from '../../ui/kit'
import { nameOf, workers } from '../../lib/store'
import { money, toBn, dateBn } from '../../lib/bn'
import { siteWages, siteMat, siteRet, siteExp, dayTotal, retTotal, pexpTotal, invTotal, draftIsEmpty } from '../../lib/draft'
import type { ReactNode } from 'react'
import { t, tf } from '../../lib/i18n'
import { siteName, type DayProps } from './common'

function Row({ title, sub, value, onClick }: { title: string; sub: ReactNode; value?: string; onClick: () => void }) {
  return (
    <button className="review-row" onClick={onClick}>
      <span><span className="t">{t(title)}</span><span className="k">{sub}</span></span>
      {value != null && <span className="v num">{value}</span>}
      <Icon name="fwd" size={16} />
    </button>
  )
}

/* একবার দেখে নিন — grouped the way he answered: each job in turn, then the shop, his own spending and the
   cash. Every line opens its question and comes back here. Money that came in is shown on its own, never
   netted against the day's spending: it is the job's income. */
export function StepReview({ s, draft, patch, jump, onSave }: Omit<DayProps, 'next'> & { jump: (key: string) => void; onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const hasMen = workers(s).length > 0
  const recvFor = (pid: string) => draft.recv.filter((r) => r.project_id === pid)
  const others = draft.recv.filter((r) => !draft.sites.some((x) => x.project_id && x.project_id === r.project_id))
  const empty = draftIsEmpty(draft)

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('একবার দেখে নিন')}</h2>
        <p className="hint">{dateBn(draft.date)}</p>
        {draft.sites.map((sd, i) => (
          <Fragment key={sd.project_id || 'shop'}>
            <p className="sectionlabel">{siteName(s, sd)}</p>
            <div className="card">
              {hasMen && <Row title="মজুরি" sub={tf('{0} জন', toBn(Object.keys(sd.att).length))} value={money(siteWages(sd))} onClick={() => jump(`men:${i}`)} />}
              {sd.project_id && <>
                <Row title="মাল" sub={sd.mats.length ? sd.mats.map((m) => nameOf(s, m.item_id)).join(', ') : t('কিছু আসেনি')} value={money(siteMat(sd))} onClick={() => jump(`mat:${i}`)} />
                {sd.rets.length > 0 && <Row title="মাল ফেরত" sub={sd.rets.map((r) => nameOf(s, r.item_id)).join(', ')} value={'−' + money(siteRet(sd))} onClick={() => jump(`mat:${i}`)} />}
                <Row title="অন্য খরচ" sub={sd.exps.length ? sd.exps.map((e) => t(e.head_bn)).join(', ') : t('কিছু নেই')} value={money(siteExp(sd))} onClick={() => jump(`exp:${i}`)} />
                <Row title="টাকা পেলাম" sub={recvFor(sd.project_id).length ? '' : t('কিছু নেই')} value={money(recvFor(sd.project_id).reduce((a, r) => a + r.amount, 0))} onClick={() => jump(`recv:${i}`)} />
                <Row title="কাজ" sub={sd.pct != null ? tf('{0}% হয়েছে', toBn(sd.pct)) : sd.stage ? (sd.stage.state === 'done' ? t('একটা ধাপ শেষ') : t('অর্ধেক হয়েছে')) : t('আগের মতোই')} onClick={() => jump(`pct:${i}`)} />
              </>}
            </div>
          </Fragment>
        ))}

        {others.length > 0 && (
          <>
            <p className="sectionlabel">{t('অন্য কাজের টাকা')}</p>
            <div className="card">
              {others.map((r) => <Row key={r.key} title="টাকা পেলাম" sub={nameOf(s, r.project_id)} value={money(r.amount)} onClick={() => jump('cash')} />)}
            </div>
          </>
        )}

        {(s.settings.runs_shop || draft.invs.length > 0) && (
          <>
            <p className="sectionlabel">{t('দোকান')}</p>
            <div className="card">
              <Row title="দোকানের মাল" sub={draft.invs.length ? draft.invs.map((m) => nameOf(s, m.item_id)).join(', ') : t('কিছু নেই')} value={money(invTotal(draft))} onClick={() => jump('shop')} />
            </div>
          </>
        )}

        <p className="sectionlabel">{t('নিজের')}</p>
        <div className="card">
          <Row title="নিজের খরচ" sub={draft.pexps.length ? draft.pexps.map((e) => t(e.head_bn)).join(', ') : t('কিছু নেই')} value={money(pexpTotal(draft))} onClick={() => jump('own')} />
        </div>

        <p className="sectionlabel">{t('হাতে টাকা')}</p>
        <div className="card">
          <Row title="দিনের শেষে" sub="" value={draft.cash_counted != null ? money(draft.cash_counted) : '—'} onClick={() => jump('cash')} />
        </div>

        <div className="card">
          <div className="total"><span className="k">{t('আজকের মোট খরচ')}</span><span className="v num">{money(dayTotal(draft) - retTotal(draft))}</span></div>
        </div>

        <div className="field" style={{ marginTop: '1rem' }}>
          <label>{t('কিছু লিখে রাখবেন? (ইচ্ছে হলে)')}</label>
          <textarea className="input" value={draft.note} onChange={(e) => patch({ note: e.target.value })} placeholder={t('যেমন — বিকেলে বৃষ্টিতে কাজ বন্ধ')} />
        </div>
        {empty && <p className="hint" style={{ marginTop: '1rem' }}>{t('আজ কিছু লেখা হয়নি। তুললে লেখা থাকবে ‘আজ কাজ হয়নি’।')}</p>}
      </div>
      <div className="actionbar">
        <button className="btn primary" disabled={saving} onClick={() => { setSaving(true); void onSave() }}>
          {saving ? t('তোলা হচ্ছে…') : t('খাতায় তুলুন')}
        </button>
      </div>
    </>
  )
}
