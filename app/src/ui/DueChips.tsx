import { Chip } from './kit'
import { DUE_CHOICES } from '../lib/dues'
import { toBn, dateBn } from '../lib/bn'
import { dueFrom } from '../lib/dues'
import { t, tf } from '../lib/i18n'

/** কবে দেবে / কবে দিতে হবে: a week, a fortnight, a month — and the party's own days when they differ. */
export function DueChips({ question, days, onChange, own, from }: {
  question: string; days: number; onChange: (d: number) => void; own?: number; from: string
}) {
  const choices = [...DUE_CHOICES]
  if (own && own > 0 && !choices.some((c) => c.days === own)) choices.push({ days: own, label: tf('{0} দিন', toBn(own)) })
  return (
    <>
      <p className="sectionlabel">{t(question)}</p>
      <div className="chips">
        {choices.map((c) => <Chip key={c.days} on={days === c.days} onClick={() => onChange(c.days)}>{t(c.label)}</Chip>)}
      </div>
      <p className="small muted" style={{ marginTop: '.4rem' }}>{tf('{0} তারিখে', dateBn(dueFrom(from, days), false))}</p>
    </>
  )
}
