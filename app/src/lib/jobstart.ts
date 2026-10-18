/* A job the app meets half-way through.

   Most of his jobs were running long before the phone: the foundation is in,
   two instalments have been paid. Setting such a job up writes what is already
   true — how much of it is done, on the same slider the evenings use; and what
   came in so far, as the job's income — so the job card is right from the
   first evening.

   What came in earlier is marked EARLIER_MODE. Cash counts only 'নগদ', so the
   money counts for the job without ever being counted again as today's cash. */

import type { Entry, ID, MoneyEntry, ProgressEntry } from './model'
import { uid } from './db'
import { isoDate } from './bn'
import { JOB_PAY_HEAD, EARLIER_MODE } from './calc'

export function jobStartRows(project_id: ID, pct: number, received: number, date = isoDate()): Entry[] {
  const batch = uid()
  const created_at = new Date().toISOString()
  const out: Entry[] = []
  if (pct > 0) {
    out.push({ id: uid(), kind: 'progress', batch, date, project_id, created_at, stage_seq: 0, state: 'pct', pct: Math.min(100, pct) } as ProgressEntry)
  }
  if (received > 0) {
    out.push({
      id: uid(), kind: 'money', batch, date, project_id, created_at, head_bn: JOB_PAY_HEAD, dir: 'received',
      amount: received, party_id: '', mode: EARLIER_MODE, note: '', personal: false, photo_id: '',
    } as MoneyEntry)
  }
  return out
}
