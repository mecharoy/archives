import { nameOf, type State } from '../../lib/store'
import type { Draft, DraftSite } from '../../lib/draft'
import type { ID } from '../../lib/model'
import { t } from '../../lib/i18n'

/* What every screen of the evening is handed. A job's own screens also get which job (`site`, an index into
   draft.sites) and a way to change just that job's part. */
export interface DayProps {
  s: State
  draft: Draft
  patch: (p: Partial<Draft>) => void
  next: () => void
}
export interface SiteProps extends DayProps {
  site: number
  patchSite: (i: number, p: Partial<DraftSite>) => void
}

/** A job's name, or the shop's men. */
export function siteName(s: State, sd: DraftSite): string {
  return sd.project_id ? nameOf(s, sd.project_id) : t('দোকানের লোক')
}

/** Keep the first row of chips full: ranked entries first, then anything else
    he has on file, so a new user is not sent into a sheet for every tap. */
export function pad<T extends { id: ID }>(ranked: T[], all: T[], n: number): T[] {
  const out = ranked.slice(0, n)
  for (const x of all) {
    if (out.length >= n) break
    if (!out.some((y) => y.id === x.id)) out.push(x)
  }
  return out
}
