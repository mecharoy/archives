import { useEffect, useMemo, useState } from 'react'
import { CheckPick, Pick, Chip, Sheet, MoneyPad } from '../../ui/kit'
import { workers, nameOf } from '../../lib/store'
import { DAYS_FOR, siteWages, type DraftAtt } from '../../lib/draft'
import { menElsewhere } from '../../lib/day'
import { lastAttendance, attendanceDone } from '../../lib/suggest'
import { money, toBn } from '../../lib/bn'
import type { ID, Presence } from '../../lib/model'
import { t, tf, okWord } from '../../lib/i18n'
import { NewWorkerSheet } from './NewSheets'
import { siteName, type SiteProps } from './common'

const PRESENCE: Record<Presence, string> = { full: 'পুরো দিন', half: 'আধা দিন', ot: 'দেড় দিন' }

/* আজ কে কে এসেছিল? — the men, with last time's crew at this job already ticked. A man already written at
   another of tonight's jobs says so and is left unticked, so one man's day is not paid twice by accident;
   ticking him anyway is his call. Half a day or a day and a half is a visible button on the row. */
export function StepMen({ s, draft, site, patchSite, next }: SiteProps) {
  const sd = draft.sites[site]
  const pid = sd.project_id
  const men = workers(s)
  const elsewhere = useMemo(() => menElsewhere(draft, site), [draft, site])
  const suggested = useMemo(() => lastAttendance(s.entries, pid, draft.date), [s.entries, pid, draft.date])
  // Men already paid for this job on this day (an earlier save today).
  const done = useMemo(() => attendanceDone(s.entries, pid, draft.date), [s.entries, pid, draft.date])
  const [change, setChange] = useState<ID | null>(null)
  const [newMan, setNewMan] = useState(false)

  useEffect(() => {
    if (sd.att_seeded) return
    if (Object.keys(sd.att).length || !suggested.size || done.size) { patchSite(site, { att_seeded: true }); return }
    const att: Record<ID, DraftAtt> = {}
    for (const [wid, presence] of suggested) {
      if (elsewhere.has(wid)) continue
      const w = men.find((x) => x.id === wid)
      if (!w) continue
      att[wid] = { presence, rate: w.rate, amount: w.rate * DAYS_FOR[presence], advance: 0 }
    }
    patchSite(site, { att, att_seeded: true })
  }, [sd.att_seeded, site]) // eslint-disable-line

  const toggle = (wid: ID) => {
    const att = { ...sd.att }
    if (att[wid]) delete att[wid]
    else {
      const w = men.find((x) => x.id === wid)!
      att[wid] = { presence: 'full', rate: w.rate, amount: w.rate, advance: 0 }
    }
    patchSite(site, { att })
  }
  const setPresence = (wid: ID, presence: Presence) => {
    const w = men.find((x) => x.id === wid)!
    const prev = sd.att[wid]
    const rate = prev?.rate ?? w.rate
    patchSite(site, { att: { ...sd.att, [wid]: { presence, rate, amount: rate * DAYS_FOR[presence], advance: prev?.advance ?? 0 } } })
    setChange(null)
  }
  const whereElse = (wid: ID) => {
    const other = draft.sites.find((x, i) => i !== site && x.att[wid])
    return other ? siteName(s, other) : ''
  }
  const fromLastTime = sd.att_seeded && suggested.size > 0 && !done.size && Object.keys(sd.att).some((w) => suggested.has(w))
  const count = Object.keys(sd.att).length

  return (
    <>
      <div className="scroll">
        <h2 className="question">{pid ? t('আজ কে কে এসেছিল?') : t('আজ দোকানে কে কে এসেছিল?')}</h2>
        {done.size > 0 ? <p className="hint">{t('কয়েকজনের মজুরি আজ আগেই লেখা হয়েছে।')}</p>
          : fromLastTime ? <p className="hint">{t('গতবারের লোকেদের টিক দেওয়া আছে।')}</p> : null}
        <div className="rowlist">
          {men.map((w) => {
            const a = sd.att[w.id]
            const sub = a ? `${t(PRESENCE[a.presence])} · ${money(a.amount)}`
              : done.has(w.id) ? t('এই দিনের মজুরি আগেই লেখা আছে')
                : elsewhere.has(w.id) ? tf('আজ লেখা হয়েছে · {0}', whereElse(w.id))
                  : tf('দিনে {0}', money(w.rate))
            return (
              <CheckPick key={w.id} on={!!a} title={w.name_bn} sub={sub} onClick={() => toggle(w.id)}
                right={a ? <span className="chg" role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setChange(w.id) }}>{t('বদলান')}</span> : ''} />
            )
          })}
          <Pick title="+ নতুন লোক" onClick={() => setNewMan(true)} />
        </div>
      </div>
      <div className="actionbar">
        <div className="btn ghost" style={{ display: 'grid', placeItems: 'center', minWidth: '6.5rem' }}>
          <span className="num">{tf('{0} জন', toBn(count))}</span>
        </div>
        <button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button>
      </div>
      {newMan && <NewWorkerSheet onClose={() => setNewMan(false)} onCreated={() => setNewMan(false)} />}
      {change && (
        <Sheet title={nameOf(s, change)} onClose={() => setChange(null)}>
          <div className="rowlist">
            {(['full', 'half', 'ot'] as Presence[]).map((p) => (
              <Pick key={p} on={sd.att[change]?.presence === p} title={p === 'ot' ? t('দেড় দিন (ওভারটাইম)') : t(PRESENCE[p])}
                onClick={() => setPresence(change, p)} />
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

/* মজুরি কত দিলেন? — worked out from each man's rate; a different amount, or an advance, on a tap. */
export function StepWages({ s, draft, site, patchSite, next }: SiteProps) {
  const sd = draft.sites[site]
  const [editing, setEditing] = useState<ID | null>(null)
  const [amount, setAmount] = useState('')
  const [advance, setAdvance] = useState('')
  const [tab, setTab] = useState<'amount' | 'advance'>('amount')
  const rows = Object.entries(sd.att)

  const open = (wid: ID) => {
    const a = sd.att[wid]
    setAmount(String(a.amount || ''))
    setAdvance(a.advance ? String(a.advance) : '')
    setTab('amount')
    setEditing(wid)
  }
  const commit = () => {
    if (!editing) return
    const a = sd.att[editing]
    patchSite(site, { att: { ...sd.att, [editing]: { ...a, amount: Number(amount) || 0, advance: Number(advance) || 0 } } })
    setEditing(null)
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('মজুরি কত দিলেন?')}</h2>
        <p className="hint">{t('অন্যরকম দিলে নামের উপর চাপুন।')}</p>
        <div className="card">
          {rows.map(([wid, a]) => (
            <button key={wid} className="review-row" onClick={() => open(wid)}>
              <span>
                <span className="t">{nameOf(s, wid)}</span>
                <span className="k">
                  {tf('{0} দিন × {1}', toBn(DAYS_FOR[a.presence]), money(a.rate))}
                  {a.advance > 0 && tf(' · অগ্রিম {0}', money(a.advance))}
                </span>
              </span>
              <span className="v num">{money(a.amount + a.advance)}</span>
            </button>
          ))}
          <div className="total">
            <span className="k">{t('মোট মজুরি')}</span>
            <span className="v num">{money(siteWages(sd))}</span>
          </div>
        </div>
      </div>
      <div className="actionbar"><button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button></div>
      {editing && (
        <Sheet title={nameOf(s, editing)} onClose={commit}>
          <div className="chips" style={{ marginBottom: '.6rem' }}>
            <Chip on={tab === 'amount'} onClick={() => setTab('amount')}>{t('মজুরি')}</Chip>
            <Chip on={tab === 'advance'} onClick={() => setTab('advance')}>{t('অগ্রিম')}</Chip>
          </div>
          {tab === 'amount'
            ? <MoneyPad value={amount} onChange={setAmount} />
            : <MoneyPad value={advance} onChange={setAdvance} />}
          <button className="btn primary" style={{ marginTop: '.8rem' }} onClick={commit}>{okWord()}</button>
        </Sheet>
      )}
    </>
  )
}
