import { useMemo, useState } from 'react'
import { Icon, Pick, Empty } from '../ui/kit'
import { TabBar } from '../ui/TabBar'
import { SCurve, BurnBars } from '../ui/charts'
import { useStore, activeProjects, stages, type Brief } from '../lib/store'
import { toBn, money } from '../lib/bn'
import { projectTotals, currentStage } from '../lib/calc'
import { currentBrief } from '../lib/brief'
import { kindLabel } from '../lib/kinds'
import type { Project } from '../lib/model'
import { NewProjectSheet } from './NewJob'
import { ProjectEditSheet } from './Settings'
import { t, tf, pick } from '../lib/i18n'
import type { Screen } from '../App'

/* কাজ — the jobs. At the top, the two things he asked to keep in front: pricing a new job, and the people
   who wrote on the website. Then one card per running job in four plain figures — what was agreed, what came
   in, what went out, what that leaves — with its kind, the step it is at, and how far it has got. Tapping a
   card opens the job to change it. Below, a new job, and the rest under আরও. */
export function Work({ onGo }: { onGo: (s: Screen) => void }) {
  const s = useStore((x) => x)
  const brief: Brief = useMemo(() => currentBrief(), [s.brief, s.entries, s.masters]) // eslint-disable-line
  const act = activeProjects(s)
  const rows = brief.projects ?? []
  const [more, setMore] = useState(false)
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState<Project | null>(null)
  const newEnquiries = s.enquiries.filter((e) => !s.enquiries_seen.includes(e.id)).length
  const cards = useMemo(() => act.map((p) => {
    const tt = projectTotals(p, s.entries, stages(s))
    const st = currentStage(p, s.entries, stages(s))
    const fromBrief = rows.find((r) => r.name_bn === p.name_bn)
    const stage = tt.pct_done >= 100 ? t('কাজ শেষ') : st.current ? tf('এখন চলছে: {0}', t(st.current.name_bn)) : ''
    return { p, tt, stage, note: fromBrief ? pick(fromBrief.note_bn, fromBrief.note_en) : tt.flag_bn, status: fromBrief?.status || tt.status }
  }), [act, s.entries, s.masters, rows]) // eslint-disable-line

  return (
    <>
      <div className="topbar">
        <h1>{t('কাজ')}<span className="sub">{act.length ? tf('{0}টি কাজ চলছে', toBn(act.length)) : t('কোনো কাজ চলছে না')}</span></h1>
      </div>
      <div className="scroll">
        <div className="tilegrid" style={{ marginTop: '1rem' }}>
          <button className="tile work" onClick={() => onGo('estimate')}>
            <Icon name="calc" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>{t('নতুন কাজের দর')}</span><span className="s">{t('দর দেওয়ার আগে')}</span></span>
          </button>
          <button className="tile work" onClick={() => onGo('enquiries')}>
            <Icon name="phone" size={24} stroke={1.6} />
            <span><span className="t" style={{ display: 'block' }}>{t('ওয়েবসাইটে খোঁজ')}</span>
              {newEnquiries > 0 ? <span className="badge crit">{tf('{0} নতুন', toBn(newEnquiries))}</span> : <span className="s">{t('যাঁরা লিখেছেন')}</span>}</span>
          </button>
        </div>

        {act.length === 0 && <Empty>{t('এখন কোনো কাজ চলছে না। নিচে নতুন কাজ যোগ করুন।')}</Empty>}

        {cards.map(({ p, tt, stage, note, status }) => (
          <button key={p.id} className="card jobcard" onClick={() => setEdit(p)}>
            <div className="spread">
              <strong>{p.name_bn}</strong>
              <span className="tag">{t(kindLabel(p.ptype))}</span>
            </div>
            {stage && <p className="small muted" style={{ marginTop: '.15rem' }}>{stage}</p>}
            <div style={{ marginTop: '.5rem' }}>
              <div className="amountline"><span className="n">{t('চুক্তি')}</span><span className="v num">{p.budget ? money(p.budget) : '—'}</span></div>
              <div className="amountline"><span className="n">{t('পেয়েছেন')}</span><span className="v num">{money(tt.received)}</span></div>
              <div className="amountline"><span className="n">{t('খরচ')}</span><span className="v num">{money(tt.cost)}</span></div>
              <div className="total"><span className="k">{t('হাতে থাকল')}</span>
                <span className="v num" style={{ color: tt.received - tt.cost < 0 ? 'var(--crit)' : undefined }}>{money(tt.received - tt.cost)}</span></div>
            </div>
            {note && status !== 'ok' && <p className="jobnote">{note}</p>}
            <div className="barrow" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="bartrack"><span className="barfill" style={{ width: `${Math.min(100, tt.pct_done)}%` }} /></span>
              <span className="pct num">{toBn(Math.round(tt.pct_done))}%</span>
            </div>
          </button>
        ))}

        <button className="btn quiet" style={{ width: '100%', marginTop: '.6rem' }} onClick={() => setAdding(true)}>{t('+ নতুন কাজ')}</button>

        {/* The curve and the material bars are for a closer look, not for every evening. */}
        {(brief.series?.scurve || (brief.series?.burn?.length ?? 0) > 0) && (
          <button className="btn quiet small" style={{ marginTop: '.6rem' }} onClick={() => setMore(!more)}>{more ? t('কম দেখুন') : t('আরও দেখুন')}</button>
        )}
        {more && brief.series?.scurve && (
          <>
            <p className="sectionlabel">{t('খরচ আর পরিকল্পনা')}</p>
            <div className="card"><SCurve data={brief.series.scurve} /></div>
          </>
        )}
        {more && brief.series?.burn && brief.series.burn.length > 0 && (
          <>
            <p className="sectionlabel">{t('মাল কত গেল')}</p>
            <div className="card"><BurnBars rows={brief.series.burn} done={brief.projects?.[0]?.pct_done ?? 0} /></div>
          </>
        )}

        <p className="sectionlabel">{t('আরও')}</p>
        <div className="rowlist">
          <Pick title="লোকজন ও মজুরি" right={<Icon name="fwd" size={18} />} onClick={() => onGo('workers')} />
          <Pick title="কাজের ধাপ" right={<Icon name="fwd" size={18} />} onClick={() => onGo('stages')} />
          <Pick title="সব কাজ, শেষ হওয়াগুলোও" right={<Icon name="fwd" size={18} />} onClick={() => onGo('projects')} />
          <Pick title="পুরোনো দিনের হিসাব" right={<Icon name="fwd" size={18} />} onClick={() => onGo('history')} />
        </div>
      </div>
      <TabBar />
      {adding && <NewProjectSheet onClose={() => setAdding(false)} onCreated={() => setAdding(false)} />}
      {edit && <ProjectEditSheet s={s} project={edit} onClose={() => setEdit(null)} />}
    </>
  )
}
