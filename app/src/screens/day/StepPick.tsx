import { useMemo, useState } from 'react'
import { CheckPick, Pick, Sheet } from '../../ui/kit'
import { activeProjects, workers } from '../../lib/store'
import { newSite, type DraftSite } from '../../lib/draft'
import { rankProjects } from '../../lib/suggest'
import { dateBn } from '../../lib/bn'
import { kindLabel } from '../../lib/kinds'
import type { ID } from '../../lib/model'
import { NewProjectSheet } from '../NewJob'
import { t } from '../../lib/i18n'
import type { DayProps } from './common'

const hasData = (sd: DraftSite) => Object.keys(sd.att).length > 0 || sd.mats.length > 0 || sd.rets.length > 0 || sd.exps.length > 0 || sd.pct != null

/* আজ কোন কাজের হিসাব লিখবেন? — every running job he could have written something for, the shop's men when
   he has a shop and men, and a new job. The jobs he ticks are asked about in the order he ticked them. */
export function StepPick({ s, draft, patch, next }: DayProps) {
  const [newJob, setNewJob] = useState(false)
  const [drop, setDrop] = useState<number | null>(null)
  const jobs = useMemo(() => {
    const act = activeProjects(s)
    return rankProjects(s.entries, act.map((p) => p.id)).map((id) => act.find((p) => p.id === id)!).filter(Boolean)
  }, [s])
  const shopMen = s.settings.runs_shop && workers(s).length > 0
  const index = (pid: ID | '') => draft.sites.findIndex((x) => x.project_id === pid)
  const toggle = (pid: ID | '') => {
    const i = index(pid)
    if (i < 0) patch({ sites: [...draft.sites, newSite(pid)] })
    else if (hasData(draft.sites[i])) setDrop(i)
    else patch({ sites: draft.sites.filter((_, k) => k !== i) })
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('আজ কোন কাজের হিসাব লিখবেন?')}</h2>
        <p className="hint">{dateBn(draft.date)}</p>
        <div className="rowlist">
          {jobs.map((p) => (
            <CheckPick key={p.id} on={index(p.id) >= 0} title={p.name_bn} sub={t(kindLabel(p.ptype))} onClick={() => toggle(p.id)} />
          ))}
          {shopMen && <CheckPick on={index('') >= 0} title={t('দোকানের লোক')} sub={t('দোকানে কেউ মজুরিতে কাজ করলে')} onClick={() => toggle('')} />}
          <Pick title="+ নতুন কাজ" onClick={() => setNewJob(true)} />
        </div>
      </div>
      <div className="actionbar">
        <button className="btn primary" onClick={() => { patch({ picked: true }); next() }}>
          {draft.sites.length ? t('এগিয়ে যান') : t('আজ কোনো কাজের হিসাব নেই')}
        </button>
      </div>
      {newJob && (
        <NewProjectSheet onClose={() => setNewJob(false)}
          onCreated={(p) => { setNewJob(false); patch({ sites: [...draft.sites, newSite(p.id)] }) }} />
      )}
      {drop != null && (
        <Sheet title="এই কাজের আজকের লেখা বাদ দেবেন?" onClose={() => setDrop(null)}>
          <div className="actionbar" style={{ borderTop: 0, padding: '.6rem 0 0' }}>
            <button className="btn ghost" onClick={() => setDrop(null)}>{t('থাক')}</button>
            <button className="btn danger" onClick={() => { const i = drop; setDrop(null); patch({ sites: draft.sites.filter((_, k) => k !== i) }) }}>{t('বাদ দিন')}</button>
          </div>
        </Sheet>
      )}
    </>
  )
}
