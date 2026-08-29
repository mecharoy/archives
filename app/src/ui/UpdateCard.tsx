/* The one line he sees when there is a newer build.

   It draws nothing at all unless the repository genuinely has a higher build
   number than the one installed — no spinner, no "you are up to date", no
   space taken while there is nothing to say. Checking happens twice a day at
   most, quietly, and a failed check is a check that never happened.

   The tap sequence is: he presses নতুনটা নিন, the file comes down, Android's
   own install screen opens, and he presses Install. We cannot and should not
   remove that last screen — an app that can replace itself unattended is a
   different and much worse thing than this one. */

import { useEffect, useState } from 'react'
import { Icon } from './kit'
import {
  checkForUpdate, downloadAndInstall, openInstallSettings, sizeText,
  type Stage, type UpdateState,
} from '../lib/update'
import { t, tf, pick } from '../lib/i18n'

export function UpdateCard() {
  const [found, setFound] = useState<UpdateState | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [why, setWhy] = useState('')

  useEffect(() => {
    let alive = true
    // Not on the first paint — the day button matters more than this does.
    const timer = setTimeout(() => {
      void checkForUpdate().then((u) => { if (alive) setFound(u) })
    }, 2500)
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  if (!found) return null

  const r = found.release
  const busy = stage === 'downloading' || stage === 'opening'

  const go = () => {
    setWhy('')
    void downloadAndInstall(r, (s, detail) => {
      setStage(s)
      if (detail) setWhy(detail)
    })
  }

  return (
    <div className="updatecard">
      <Icon name="cloud" size={24} stroke={1.7} />
      <div className="body">
        <p className="t">{tf('নতুন সংস্করণ এসেছে — {0}', r.name)}</p>
        {pick(r.notes_bn, r.notes_en) && <p className="s">{pick(r.notes_bn, r.notes_en)}</p>}

        {stage === 'blocked' && (
          <p className="s warn">
            {t('এই অ্যাপকে নতুন সংস্করণ বসানোর অনুমতি দেওয়া নেই। একবার অনুমতি দিলে পরের বার থেকে আর লাগবে না।')}
          </p>
        )}
        {stage === 'failed' && <p className="s warn">{why || t('নামানো গেল না। পরে আবার দেখুন।')}</p>}
        {stage === 'downloading' && <p className="s">{t('নামছে…')}{r.size ? ' · ' + sizeText(r.size) : ''}</p>}
        {stage === 'opening' && <p className="s">{t('বসানোর পাতা খুলছে…')}</p>}
        {stage === 'done' && <p className="s">{t('ফোনের নিজের পাতায় "Install" চাপুন।')}</p>}

        <div className="acts">
          {stage === 'blocked' ? (
            <button className="btn primary" onClick={() => { void openInstallSettings(); setStage(null) }}>
              {t('অনুমতি দিন')}
            </button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={go}>
              {t(stage === 'failed' ? 'আবার চেষ্টা করুন' : 'নতুনটা নিন')}
            </button>
          )}
          <button className="btn quiet" disabled={busy} onClick={() => setFound(null)}>{t('পরে')}</button>
        </div>
      </div>
    </div>
  )
}
