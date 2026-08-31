/* What he sees when a newer build exists.

   Both the quiet card on the home screen and the pop-up that greets him when
   he opens the app read the same thing from the store — the answer the shell
   parked there on open. Neither draws anything unless there is genuinely a
   newer build than the one he is running.

   Installing downloads the build inside the app and hands it to Android's own
   installer — the one-tap install screen, the nearest thing to a Play Store
   update. Only if that fails does it fall back to the phone's browser. The
   last tap is always his; Android never lets a sideloaded app replace itself
   unattended. */

import { useState } from 'react'
import { Icon, Sheet } from './kit'
import {
  downloadAndInstall, openInstallSettings, openLatestDownload, sizeText, type Release, type Stage,
} from '../lib/update'
import { useStore, setState } from '../lib/store'
import { BUILD_NAME } from '../lib/buildinfo'
import { t, tf, pick } from '../lib/i18n'

/* The shared install flow: in-app download → Android installer, with the
   browser as a last resort and a permission prompt when Android asks for one. */
function useInstall() {
  const [stage, setStage] = useState<Stage | null>(null)
  const [blocked, setBlocked] = useState(false)
  const run = (r: Release) => {
    setStage('downloading')   // instant feedback — the button never looks dead
    // If the in-app path does not clearly get moving within ~20s (a phone whose
    // native bridge stalls), stop waiting and hand it to the browser, which
    // works everywhere. Reaching the installer, a block, or a failure cancels
    // this — only a silent stall trips it.
    let settled = false
    const toBrowser = setTimeout(() => {
      if (settled) return
      settled = true
      setStage('failed')
      openLatestDownload(r.url)
    }, 20000)
    void downloadAndInstall(r, (st) => {
      if (st === 'opening' || st === 'done' || st === 'blocked' || st === 'failed') { settled = true; clearTimeout(toBrowser) }
      setStage(st)
      if (st === 'blocked') setBlocked(true)
      if (st === 'failed') openLatestDownload(r.url)   // last resort: the browser
    })
  }
  const busy = stage === 'downloading' || stage === 'opening'
  return { stage, blocked, setBlocked, run, busy }
}

function stageLine(stage: Stage | null, size?: number): string {
  if (stage === 'downloading') return t('নামছে…') + (size ? ' · ' + sizeText(size) : '')
  if (stage === 'opening') return t('বসানোর পাতা খুলছে…')
  if (stage === 'done') return t('ফোনের নিজের পাতায় "Install" চাপুন।')
  if (stage === 'failed') return t('অ্যাপেই বসানো গেল না — ব্রাউজারে নামানো হচ্ছে।')
  return ''
}

/* The pop-up. It comes up over the home screen each time he opens the app and
   there is a newer build waiting — he asked to be told every time. ‘পরে’ hides
   it for now; it returns next time he opens the app, because the check runs
   again then and parks the answer afresh. */
export function UpdateModal() {
  const found = useStore((s) => s.update)
  const [hidden, setHidden] = useState(false)
  const { stage, blocked, setBlocked, run, busy } = useInstall()
  if (!found || hidden) return null
  const r = found.release
  return (
    <Sheet title={tf('নতুন সংস্করণ এসেছে — {0}', r.name)} onClose={() => setHidden(true)}>
      <p className="hint">{tf('এখন আছে {0}, নতুন {1}', BUILD_NAME, r.name)}</p>
      {pick(r.notes_bn, r.notes_en) && <p className="hint">{pick(r.notes_bn, r.notes_en)}</p>}
      {stage && <p className={'hint' + (stage === 'failed' ? ' warn' : '')}>{stageLine(stage, r.size)}</p>}
      {blocked ? (
        <button className="btn primary" onClick={() => { void openInstallSettings(); setBlocked(false) }}>{t('অনুমতি দিন')}</button>
      ) : (
        <button className="btn primary" disabled={busy} onClick={() => run(r)}>
          {t('এখনই নিন')}{r.size ? ' · ' + sizeText(r.size) : ''}
        </button>
      )}
      <button className="btn quiet" disabled={busy} onClick={() => setHidden(true)}>{t('পরে')}</button>
    </Sheet>
  )
}

/* The quiet inline card, for when he has dismissed the pop-up but the update
   is still there — it sits under the day button and never outranks it. */
export function UpdateCard() {
  const found = useStore((s) => s.update)
  const [gone, setGone] = useState(false)
  const { stage, blocked, setBlocked, run, busy } = useInstall()
  if (!found || gone) return null
  const r = found.release
  return (
    <div className="updatecard">
      <Icon name="cloud" size={24} stroke={1.7} />
      <div className="body">
        <p className="t">{tf('নতুন সংস্করণ এসেছে — {0}', r.name)}</p>
        {pick(r.notes_bn, r.notes_en) && <p className="s">{pick(r.notes_bn, r.notes_en)}</p>}
        {stage && <p className={'s' + (stage === 'failed' ? ' warn' : '')}>{stageLine(stage, r.size)}</p>}
        <div className="acts">
          {blocked ? (
            <button className="btn primary" onClick={() => { void openInstallSettings(); setBlocked(false) }}>{t('অনুমতি দিন')}</button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => run(r)}>
              {t('নতুনটা নিন')}{r.size ? ' · ' + sizeText(r.size) : ''}
            </button>
          )}
          <button className="btn quiet" disabled={busy} onClick={() => { setGone(true); setState({ update: null }) }}>{t('পরে')}</button>
        </div>
      </div>
    </div>
  )
}
