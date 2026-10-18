import { useMemo, useState } from 'react'
import { Pick, MoneyPad } from '../../ui/kit'
import { cashState } from '../../lib/calc'
import { cashAfterDay } from '../../lib/draft'
import { money, dayLabelBn } from '../../lib/bn'
import { activeProjects } from '../../lib/store'
import { ReceivedForm } from '../Received'
import { t, tf, okWord } from '../../lib/i18n'
import type { DayProps } from './common'

/* এখন হাতে কত টাকা? — once for the whole day, after everything that moved money is written. The book says what
   should be there; he says yes, or counts. More in the box than the book expects is almost always money that
   came in and was not written, so that is offered; less is the one where a forgotten expense is likely. */
export function StepCash({ s, draft, patch, next }: DayProps) {
  const cash = useMemo(() => cashState(s.entries, s.settings.opening_cash, s.settings.opening_date), [s.entries, s.settings])
  // By the book's own rules, with this day's rows in it: credit and UPI are not cash, shop goods bought for cash are.
  const expected = useMemo(() => cashAfterDay(s.entries, draft, s.settings.opening_cash, s.settings.opening_date), [s.entries, s.settings, draft])
  const [counting, setCounting] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [value, setValue] = useState('')
  const diff = draft.cash_counted != null ? draft.cash_counted - expected : null
  // Before he has ever counted, the book has no idea what is in his pocket: ask him to count.
  const neverCounted = !s.entries.some((e) => e.kind === 'day' && e.cash_counted != null) && !s.settings.opening_cash

  if (receiving) {
    return <ReceivedForm s={s} defaultProject="" onBack={() => setReceiving(false)}
      onAdd={(r) => { patch({ recv: [...draft.recv, r] }); setReceiving(false) }} />
  }

  if (counting) {
    return (
      <>
        <div className="scroll">
          <h2 className="question">{t('গুনে কত হল?')}</h2>
          <MoneyPad value={value} onChange={setValue} />
        </div>
        <div className="actionbar">
          <button className="btn ghost" onClick={() => setCounting(false)}>{t('ফিরে')}</button>
          <button className="btn primary" disabled={!value} onClick={() => { patch({ cash_counted: Number(value) }); setCounting(false) }}>{okWord()}</button>
        </div>
      </>
    )
  }

  const first = neverCounted && draft.cash_counted == null
  return (
    <>
      <div className="scroll">
        <h2 className="question">{t('এখন হাতে কত টাকা?')}</h2>
        {first ? (
          <p className="hint">{t('প্রথমবার একবার গুনে বলুন।')}</p>
        ) : (
          <>
            <p className="hint">{draft.cash_counted != null ? t('আপনি গুনে বললেন') : t('খাতা বলছে থাকার কথা')}</p>
            <div className="moneyfield num" style={{ paddingTop: '.2rem' }}>{money(draft.cash_counted ?? expected)}</div>
            {draft.cash_counted != null && (
              <p className="hint" style={{ textAlign: 'center', marginTop: '-.4rem' }}>{tf('খাতায় ছিল {0}', money(expected))}</p>
            )}
          </>
        )}
        {diff != null && diff <= -1 && (
          <div className={'alert ' + (-diff > 2000 ? 'crit' : 'warn')} style={{ marginTop: '.6rem' }}>
            <span className="dot" />
            <span>{tf('খাতার চেয়ে {0} কম। কোনো খরচ বাদ গেছে?', money(-diff))}</span>
          </div>
        )}
        {diff != null && diff >= 1 && (
          <div className="alert" style={{ marginTop: '.6rem' }}>
            <span className="dot" />
            <span>{tf('খাতার চেয়ে {0} বেশি। কেউ টাকা দিয়েছেন?', money(diff))}</span>
          </div>
        )}
        {diff != null && diff >= 1 && activeProjects(s).length > 0 && (
          <button className="btn quiet" style={{ marginTop: '.6rem', width: '100%' }} onClick={() => setReceiving(true)}>{t('হ্যাঁ, লিখে দিই')}</button>
        )}
        <div className="rowlist" style={{ marginTop: '1.1rem' }}>
          {first ? (
            <>
              <Pick title="গুনে বলছি" onClick={() => { setValue(''); setCounting(true) }} />
              <Pick title="আজ থাক" onClick={next} />
            </>
          ) : (
            <>
              <Pick title={draft.cash_counted != null ? t('ঠিক আছে, এগোই') : t('হ্যাঁ, এটাই আছে')}
                onClick={() => { if (draft.cash_counted == null) patch({ cash_counted: expected }); next() }} />
              <Pick title={draft.cash_counted != null ? t('আবার গুনি') : t('না, গুনে বলছি')} onClick={() => { setValue(''); setCounting(true) }} />
            </>
          )}
        </div>
        {!neverCounted && cash.anchor_date && (
          <p className="hint" style={{ marginTop: '1.2rem' }}>{tf('শেষ গোনা {0} — {1}', dayLabelBn(cash.anchor_date), money(cash.anchor_amount))}</p>
        )}
      </div>
      {draft.cash_counted != null && (
        <div className="actionbar"><button className="btn primary" onClick={next}>{t('এগিয়ে যান')}</button></div>
      )}
    </>
  )
}
