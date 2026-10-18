import { useMemo, useState } from 'react'
import { Icon, Pick, Chip, Sheet, MoneyPad } from '../../ui/kit'
import { noteChip, type State } from '../../lib/store'
import { uid } from '../../lib/db'
import { money } from '../../lib/bn'
import { MONEY_HEADS_SITE, MONEY_HEADS_PERSONAL, PAY_MODES, type ID } from '../../lib/model'
import type { DraftExp } from '../../lib/draft'
import { rankHeads, amountChips } from '../../lib/suggest'
import { modeLabel } from '../../lib/calc'
import { capture } from '../../lib/photo'
import { t, tf } from '../../lib/i18n'

/* আর কোনো খরচ? for a job — and, the same screens, নিজের বা সংসারের কোনো খরচ? for his own book. The heads and
   the suggested amounts come from whichever book it writes to; his own spending never touches a job. */
export function StepExpense({ s, list, setList, personal = false, question, hint, next }: {
  s: State; list: DraftExp[]; setList: (l: DraftExp[]) => void
  personal?: boolean; question: string; hint: string; next: () => void
}) {
  const [sub, setSub] = useState<'ask' | 'head' | 'amount'>('ask')
  const [head, setHead] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState(PAY_MODES[0])
  const [photo, setPhoto] = useState<ID | ''>('')
  const [showAll, setShowAll] = useState(false)
  const total = list.reduce((a, e) => a + e.amount, 0)

  const heads = personal ? MONEY_HEADS_PERSONAL : MONEY_HEADS_SITE
  const ranked = useMemo(() => rankHeads(s.entries, personal), [s.entries, personal])
  const ordered = [...ranked, ...heads.filter((h) => !ranked.includes(h))]
  const top = ordered.slice(0, 3)
  const chips = useMemo(() => amountChips(s.entries, head, personal), [s.entries, head, personal])

  const add = () => {
    setList([...list, { key: uid(), head_bn: head, amount: Number(amount) || 0, mode, note: '', photo_id: photo }])
    setHead(''); setAmount(''); setPhoto(''); setSub('ask')
  }

  if (sub === 'head') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('কীসের খরচ?')}</h2>
          <div className="chips">
            {top.map((h) => <Chip key={h} onClick={() => { noteChip(true); setHead(h); setSub('amount') }}>{h}</Chip>)}
            <Chip onClick={() => { noteChip(false); setShowAll(true) }}>{t('আরও…')}</Chip>
          </div>
        </div>
        <div className="actionbar"><button className="btn ghost" style={{ flex: 1 }} onClick={() => setSub('ask')}>{t('ফিরে')}</button></div>
        {showAll && (
          <Sheet title="সব খরচের ধরন" onClose={() => setShowAll(false)}>
            <div className="rowlist">
              {ordered.map((h) => <Pick key={h} title={h} onClick={() => { setHead(h); setShowAll(false); setSub('amount') }} />)}
            </div>
          </Sheet>
        )}
      </>
    )
  }

  if (sub === 'amount') {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{tf('{0} কত?', t(head))}</h2>
          <MoneyPad value={amount} onChange={setAmount} chips={chips} onChipTaken={() => noteChip(true)} />
          <p className="sectionlabel">{t('কীভাবে দিলেন')}</p>
          <div className="chips">
            {PAY_MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{modeLabel(m)}</Chip>)}
          </div>
          <button className="btn quiet small" style={{ marginTop: '1rem' }}
            onClick={async () => { const id = await capture(); if (id) setPhoto(id) }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <Icon name="camera" size={18} />{photo ? t('বিলের ছবি নেওয়া হয়েছে') : t('বিলের ছবি তুলুন (ইচ্ছে হলে)')}
            </span>
          </button>
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setSub('head')}>{t('ফিরে')}</button>
          <button className="btn primary" disabled={!Number(amount)} onClick={add}>{t('যোগ করুন')}</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="scroll">
        <h2 className="question">{t(question)}</h2>
        <p className="hint">{t(hint)}</p>
        {list.length > 0 && (
          <div className="card" style={{ marginBottom: '.9rem' }}>
            {list.map((e) => (
              <div key={e.key} className="review-row">
                <span><span className="t">{t(e.head_bn)}</span><span className="k">{modeLabel(e.mode)}</span></span>
                <span className="v num">{money(e.amount)}</span>
                <button className="iconbtn" onClick={() => setList(list.filter((x) => x.key !== e.key))} aria-label={t('বাদ দিন')}><Icon name="trash" size={18} /></button>
              </div>
            ))}
            <div className="total"><span className="k">{t('মোট')}</span><span className="v num">{money(total)}</span></div>
          </div>
        )}
        {list.length > 0
          ? <button className="btn quiet" style={{ width: '100%' }} onClick={() => setSub('head')}>{t('আরও খরচ')}</button>
          : (
            <div className="yesno">
              <button onClick={next}>{t('না')}</button>
              <button className="on" onClick={() => setSub('head')}>{t('হ্যাঁ')}</button>
            </div>
          )}
      </div>
      {list.length > 0 && <div className="actionbar"><button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button></div>}
    </>
  )
}
