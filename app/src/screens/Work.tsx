import { useMemo } from 'react'
import { Icon, TopBar, Empty } from '../ui/kit'
import { SCurve, BurnBars } from '../ui/charts'
import { useStore, activeProjects, type Brief } from '../lib/store'
import { toBn } from '../lib/bn'
import { localBrief, briefIsStale } from '../lib/brief'
import { t, pick } from '../lib/i18n'
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

  return (
    <>
      <TopBar title="কাজ" onBack={onBack} />
      <div className="scroll">
        {act.length === 0 && (
          <Empty>{t('এখনও কোনো কাজ যোগ করা হয়নি। নিচে ‘কাজ যোগ করা, বদলানো’ থেকে শুরু করুন।')}</Empty>
        )}

        {rows.length > 0 && (
          <>
            <p className="sectionlabel">{t('কাজের অবস্থা')}</p>
            <div className="card">
              {rows.map((p, k) => (
                <div key={k} style={{ padding: '.55rem 0', borderBottom: k < rows.length - 1 ? '1px solid var(--line-soft)' : 0 }}>
                  <div className="spread">
                    <strong>{pick(p.name_bn, p.name_en)}</strong>
                    <span className={'badge ' + (p.status || 'ok')}>{pick(p.note_bn, p.note_en)}</span>
                  </div>
                  <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
                    <span className="name small muted">{t('কাজ')}</span>
                    <span className="bartrack"><span className="barfill" style={{ width: `${Math.min(100, p.pct_done)}%` }} /></span>
                    <span className="pct num">{toBn(Math.round(p.pct_done))}%</span>
                  </div>
                  <div className="barrow" style={{ gridTemplateColumns: '3.4rem 1fr auto' }}>
                    <span className="name small muted">{t('খরচ')}</span>
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
            <p className="sectionlabel">{t('খরচ আর পরিকল্পনা')}</p>
            <div className="card"><SCurve data={brief.series.scurve} /></div>
          </>
        )}

        {brief.series?.burn && brief.series.burn.length > 0 && (
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
