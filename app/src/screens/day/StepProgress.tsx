import { projects, stages } from '../../lib/store'
import { projectPct, lastSlider, stageAtPct } from '../../lib/calc'
import { kindStages } from '../../lib/kinds'
import { toBn, addDays } from '../../lib/bn'
import { t, tf } from '../../lib/i18n'
import type { SiteProps } from './common'

/* কাজ কতটা হয়েছে? — how much of the whole job is done, on a slider in steps of 5, with a − and a + for
   a thumb that slips. It opens where the job stood (yesterday's slider, or the stage marks before there was
   one) and writes only if he moves it: an untouched slider leaves yesterday's figure standing. Under it,
   the step of this kind of work that the figure falls in. */
export function StepProgress({ s, draft, site, patchSite, next }: SiteProps) {
  const sd = draft.sites[site]
  const p = projects(s).find((x) => x.id === sd.project_id)
  if (!p) return null
  // On the slider's own grid of fives, so the figure it opens at and the line under it say the same thing.
  const before = Math.round(projectPct(p, s.entries, stages(s)) / 5) * 5
  const shown = sd.pct ?? before
  const prev = lastSlider(p, s.entries)
  const said = prev || before > 0
    ? tf(prev && prev.date === addDays(draft.date, -1) ? 'গতকাল ছিল {0}%' : 'আগে ছিল {0}%', toBn(before))
    : ''
  const steps = kindStages(stages(s), p.ptype)
  const at = steps.length > 1 ? (shown >= 100 ? t('কাজ শেষ') : tf('এখন চলছে: {0}', t(stageAtPct(steps, shown)?.name_bn || ''))) : ''
  const set = (v: number) => patchSite(site, { pct: Math.max(0, Math.min(100, v)) })

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('কাজ কতটা হয়েছে?')}</h2>
        <div className="pctbig num">{toBn(shown)}%</div>
        <input type="range" className="slider" min={0} max={100} step={5} value={shown}
          aria-label={t('কাজ কতটা হয়েছে?')} onChange={(e) => set(Number(e.target.value))}
          style={{ ['--fill' as string]: shown + '%' }} />
        <div className="pm">
          <button className="pmbtn" onClick={() => set(shown - 5)} aria-label={t('৫% কম')}>−</button>
          <span className="mid">{said}</span>
          <button className="pmbtn" onClick={() => set(shown + 5)} aria-label={t('৫% বেশি')}>+</button>
        </div>
        {at && <p className="hint" style={{ textAlign: 'center', marginTop: '.8rem' }}>{at}</p>}
      </div>
      <div className="actionbar"><button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button></div>
    </>
  )
}
