/* The first-run walk round the app.

   Onboarding asks him things. This shows him things — a different job, and it
   only earns its place if it is short. Five stops, each pointing at one real
   control on the screen he is already looking at, in the order he will use
   them: the thing he does every evening, the reading that arrives overnight,
   the three books, the running totals, and where to change the language.

   It points at live elements rather than pictures of them, so it can never
   drift out of date the way a screenshot would: each step names a
   `data-tour` attribute, and if that element is not on the screen the step is
   skipped rather than pointing at nothing.

   He can leave at any stop, and it never comes back on its own. It is in
   Settings afterwards for the day he wants it again. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'

export interface Stop {
  target: string        // the data-tour value to point at
  title: string
  body: string
  place?: 'above' | 'below'  // where the card goes; default: whichever side has room
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 8          // breathing room around the highlighted control
const GAP = 12         // between the cut-out and the card

export function Tour({ stops, onDone }: { stops: Stop[]; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(160)

  /* Only the stops whose target is actually on screen. Computed once, so the
     step count he sees ("2 / 5") never changes under him. */
  const live = useRef<Stop[]>([])
  if (!live.current.length) {
    live.current = stops.filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
  }
  const list = live.current
  const stop = list[i]

  const measure = () => {
    if (!stop) return
    const el = document.querySelector(`[data-tour="${stop.target}"]`)
    if (!el) { setBox(null); return }
    const r = el.getBoundingClientRect()
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }

  /* Bring the control into view first, then measure — measuring mid-scroll is
     how a spotlight ends up half a screen away from the thing it points at. */
  useEffect(() => {
    if (!stop) { onDone(); return }
    const el = document.querySelector(`[data-tour="${stop.target}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(measure, 380)
    return () => clearTimeout(timer)
  }, [i]) // eslint-disable-line

  useEffect(() => {
    const on = () => measure()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true) }
  }, [i]) // eslint-disable-line

  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight) }, [i, box])

  if (!stop) return null

  const vh = window.innerHeight
  /* Below the control if there is room for the whole card, otherwise above.
     An explicit `place` wins, but only when it actually fits. */
  const roomBelow = box ? vh - (box.top + box.height) - GAP : vh
  const roomAbove = box ? box.top - GAP : 0
  const wantBelow = stop.place === 'below' ? roomBelow > cardH + 16
    : stop.place === 'above' ? !(roomAbove > cardH + 16)
    : roomBelow >= roomAbove
  const cardTop = !box ? vh / 2 - cardH / 2
    : wantBelow ? Math.min(box.top + box.height + GAP, vh - cardH - 16)
    : Math.max(16, box.top - GAP - cardH)

  const last = i === list.length - 1
  const finish = () => onDone()

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('অ্যাপ ঘুরে দেখা')}>
      {/* The dim is the cut-out's own shadow, so there is exactly one element
          to line up with the control and nothing can drift out of register. */}
      {box && (
        <div className="tour-hole" style={{
          top: box.top, left: box.left, width: box.width, height: box.height,
        }} />
      )}

      <div className="tour-card" ref={cardRef} style={{ top: cardTop }}>
        <p className="tour-step">{i + 1} / {list.length}</p>
        <h3>{t(stop.title)}</h3>
        <p>{t(stop.body)}</p>
        <div className="tour-btns">
          <button className="tour-skip" onClick={finish}>{t(last ? '' : 'বাদ দিন')}</button>
          <button className="btn primary" onClick={() => (last ? finish() : setI(i + 1))}>
            {t(last ? 'বুঝেছি, শুরু করি' : 'পরেরটা')}
          </button>
        </div>
      </div>
    </div>
  )
}
