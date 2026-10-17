import { useState, type ReactNode } from 'react'
import { Chip, Sheet, Pick } from './kit'
import { toAscii } from '../lib/bn'
import type { ID, Party } from '../lib/model'
import { t } from '../lib/i18n'

/* Pick a person: the likely few as chips, and everyone else one tap away.

   The helper copies a whole paper khata in on the first day — dozens of names.
   A picker that showed only the first few left the rest unreachable, and a name
   that cannot be picked gets typed again, splitting one man's dues across two
   records. So every list of people ends in আরও…, a searchable list of all. */
export function PartyPicker({ list, top, value, onPick, onNew, extra }: {
  list: Party[]; top: Party[]; value: ID | ''; onPick: (id: ID) => void; onNew?: () => void; extra?: ReactNode
}) {
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')
  // The one he picked from the full list stays visible as a chip, so he can see what is chosen.
  const shown = value && !top.some((p) => p.id === value) ? [...top, ...list.filter((p) => p.id === value)] : top
  // A name, or part of a number: Bengali and ASCII digits alike.
  const needle = toAscii(q.trim().toLowerCase())
  const digits = needle.replace(/[^0-9]/g, '')
  const matches = (p: Party) =>
    toAscii(p.name_bn.toLowerCase()).includes(needle) || (digits !== '' && (p.phone || '').replace(/[^0-9]/g, '').includes(digits))
  const found = needle ? list.filter(matches) : list
  return (
    <>
      <div className="chips">
        {shown.map((p) => <Chip key={p.id} on={value === p.id} onClick={() => onPick(p.id)}>{p.name_bn}</Chip>)}
        {list.length > top.length && <Chip onClick={() => { setQ(''); setAll(true) }}>{t('আরও…')}</Chip>}
        {extra}
        {onNew && <Chip onClick={onNew}>{t('+ নতুন')}</Chip>}
      </div>
      {all && (
        <Sheet title="সব নাম" onClose={() => setAll(false)}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('নাম বা নম্বর লিখে খুঁজুন')} autoFocus />
          <div className="rowlist" style={{ marginTop: '.6rem' }}>
            {found.map((p) => <Pick key={p.id} on={value === p.id} title={p.name_bn} sub={p.phone || undefined} onClick={() => { onPick(p.id); setAll(false) }} />)}
            {found.length === 0 && <p className="small muted">{t('এই নামে কেউ নেই।')}</p>}
            {onNew && <Pick title="+ নতুন" onClick={() => { setAll(false); onNew() }} />}
          </div>
        </Sheet>
      )}
    </>
  )
}
