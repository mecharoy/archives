/* What he sees when a newer build exists.

   Both the quiet card on the home screen and the pop-up that greets him when
   he opens the app read the same thing from the store — the answer the shell
   parked there on open. Neither draws anything unless there is genuinely a
   newer build than the one he is running.

   Installing hands the APK link to the phone's own browser, which downloads it
   and opens Android's install screen — the same path as the manual sideload,
   and the one that works no matter what the custom native plugin is doing. The
   last tap is always his. */

import { useState } from 'react'
import { Icon, Sheet } from './kit'
import { openLatestDownload, sizeText } from '../lib/update'
import { useStore, setState } from '../lib/store'
import { t, tf, pick } from '../lib/i18n'

/* The pop-up. It comes up over the home screen each time he opens the app and
   there is a newer build waiting — he asked to be told every time, not once.
   ‘পরে’ hides it for now; it returns next time he opens the app, because the
   check runs again then and parks the answer afresh. */
export function UpdateModal() {
  const found = useStore((s) => s.update)
  const [hidden, setHidden] = useState(false)
  if (!found || hidden) return null
  const r = found.release
  return (
    <Sheet title={tf('নতুন সংস্করণ এসেছে — {0}', r.name)} onClose={() => setHidden(true)}>
      {pick(r.notes_bn, r.notes_en) && <p className="hint">{pick(r.notes_bn, r.notes_en)}</p>}
      <p className="hint">{t('“এখনই নিন” চাপলে ফোনের ব্রাউজারে নতুন ফাইলটা নামবে, তারপর Install চাপুন। আপনার লেখা হিসাব থেকে যাবে।')}</p>
      <button className="btn primary" onClick={() => openLatestDownload(r.url)}>
        {t('এখনই নিন')}{r.size ? ' · ' + sizeText(r.size) : ''}
      </button>
      <button className="btn quiet" onClick={() => setHidden(true)}>{t('পরে')}</button>
    </Sheet>
  )
}

/* The quiet inline card, for when he has dismissed the pop-up but the update
   is still there — it sits under the day button and never outranks it. */
export function UpdateCard() {
  const found = useStore((s) => s.update)
  const [gone, setGone] = useState(false)
  if (!found || gone) return null
  const r = found.release
  return (
    <div className="updatecard">
      <Icon name="cloud" size={24} stroke={1.7} />
      <div className="body">
        <p className="t">{tf('নতুন সংস্করণ এসেছে — {0}', r.name)}</p>
        {pick(r.notes_bn, r.notes_en) && <p className="s">{pick(r.notes_bn, r.notes_en)}</p>}
        <div className="acts">
          <button className="btn primary" onClick={() => openLatestDownload(r.url)}>
            {t('নতুনটা নিন')}{r.size ? ' · ' + sizeText(r.size) : ''}
          </button>
          <button className="btn quiet" onClick={() => { setGone(true); setState({ update: null }) }}>{t('পরে')}</button>
        </div>
      </div>
    </div>
  )
}
