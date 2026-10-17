import { useMemo, useState } from 'react'
import { Icon, TopBar, Empty } from '../ui/kit'
import { SCurve, BurnBars } from '../ui/charts'
import { useStore, activeProjects, stages, type Brief } from '../lib/store'
import { toBn, money } from '../lib/bn'
import { projectTotals, currentStage } from '../lib/calc'
import { localBrief, briefIsStale } from '../lib/brief'
import { t, tf, pick, statusWord } from '../lib/i18n'
import type { Screen } from '../App'

/* কাজ — the whole site book on one screen. Progress and cost of every live
   job at the top (from last night's reading, or the phone's own sums when
   there is none), and under it every site thing he might want to do or change:
   price a new job, add or edit a site, the men, the stages. Editing lives here
   beside the reading, so he never leaves the book to change something in it. */
export function Work({ onBack, onGo }: { onBack: () => void; onGo: (s: Screen) => void }) {
  const s = useStore((x) => x)
  const stale = briefIsStale(s.brief)
  const brief: Brief = useMemo(() => (s.brief && !stale ? s.brief : localBrief()), [s.brief, stale, s.entries, s.masters])
  const act = activeProjects(s)
  const rows = brief.projects ?? []
  const [more, setMore] = useState(false)
  /* Each live job in four plain figures: what was agreed, what came in, what went out, and what that
     leaves in hand — the phone's own sums over his own rows — and the stage the work is at. */
  const cards = useMemo(() => act.map((p) => {
    const tt = projectTotals(p, s.entries, stages(s))
    const st = currentStage(p, s.entries, stages(s)).current
    const fromBrief = rows.find((r) => r.name_bn === p.name_bn)
    return { p, tt, stage: st?.name_bn || '', note: fromBrief ? pick(fromBrief.note_bn, fromBrief.note_en) : tt.flag_bn, status: fromBrief?.status || tt.status }
  }), [act, s.entries, s.masters, rows]) // eslint-disable-line

  return (
    <>
      <TopBar title="কাজ" onBack={onBack} />
      <div className="scroll">
        {act.length === 0 && (
          <Empty>{t('এখনও কোনো কাজ যোগ করা হয়নি। নিচে ‘কাজ যোগ করা, বদলানো’ থেকে শুরু করুন।')}</Empty>
        )}

        {cards.map(({ p, tt, stage, note, status }) => (
          <div key={p.id} className="card jobcard">
            <div className="spread">
              <strong>{p.name_bn}</strong>
              <span className={'badge ' + (status || 'ok')}>{statusWord(status)}</span>
            </div>
            {stage && <p className="small muted" style={{ marginTop: '.15rem' }}>{tf('এখন চলছে — {0}', t(stage))}</p>}
            <div style={{ marginTop: '.5rem' }}>
              <div className="amountline"><span className="n">{t('চুক্তি')}</span><span className="v num">{p.budget ? money(p.budget) : '—'}</span></div>
              <div className="amountline"><span className="n">{t('পেয়েছেন')}</span><span className="v num">{money(tt.received)}</span></div>
              <div className="amountline"><span className="n">{t('খরচ')}</span><span className="v num">{money(tt.cost)}</span></div>
              <div className="total"><span className="k">{t('হাতে থাকল')}</span>
                <span className="v num" style={{ color: tt.received - tt.cost < 0 ? 'var(--crit)' : undefined }}>{money(tt.received - tt.cost)}</span></div>
            </div>
            {note && <p className="jobnote">{note}</p>}
            <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
              <span className="name small muted">{t('কাজ')}</span>
              <span className="bartrack"><span className="barfill" style={{ width: `${Math.min(100, tt.pct_done)}%` }} /></span>
              <span className="pct num">{toBn(Math.round(tt.pct_done))}%</span>
            </div>
          </div>
        ))}

        {/* The curve and the material bars are for a closer look, not for every evening. */}
        {(brief.series?.scurve || (brief.series?.burn?.length ?? 0) > 0) && (
          <button className="btn quiet small" style={{ marginTop: '.4rem' }} onClick={() => setMore(!more)}>{more ? t('কম দেখুন') : t('আরও দেখুন')}</button>
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
            <div className="card">
              <BurnBars rows={brief.series.burn} done={brief.projects?.[0]?.pct_done ?? 0} />
            </div>
          </>
        )}

        <p className="sectionlabel">{t('এই খাতার কাজ')}</p>
        <div className="tilegrid">
          <Tile icon="calc" title="নতুন কাজের হিসাব" sub="দর দেওয়ার আগে" onClick={() => onGo('estimate')} />
          <Tile icon="book" title="কাজ যোগ করা, বদলানো" sub="সাইটের নাম, দর" onClick={() => onGo('projects')} />
          <Tile icon="people" title="লোকজন" sub="কে, কত মজুরি" onClick={() => onGo('workers')} />
          <Tile icon="chart" title="কাজের ধাপ ও থাম্ব রুল" sub="অগ্রগতির নিয়ম" onClick={() => onGo('stages')} />
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
