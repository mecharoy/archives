import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toBn, parseNum, groupIndian } from '../lib/bn'
import { t } from '../lib/i18n'

/* Every word that reaches the screen through this kit is translated here, at
   the last moment before it is drawn. That is deliberate: the ledger keeps
   Bengali — units, expense heads, item names — and only the rendering
   changes, so switching language can never rewrite a stored row.
   A string with no English of its own simply comes back in Bengali. */
const tr = (x: ReactNode): ReactNode => (typeof x === 'string' ? t(x) : x)

/* ---------- icons ----------
   Hand-drawn stroke set, 24px grid, so nothing looks like a pasted icon font. */

const paths: Record<string, string> = {
  back: 'M15 5 8 12l7 7',
  fwd: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.72 1.13V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.77-1.09l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 3.1 14.3H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.2 7.5l-.06-.06A2 2 0 1 1 6.97 4.6l.06.06A1.6 1.6 0 0 0 9.8 3.57V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.73 1.09l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.26 1.88',
  camera: 'M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9z M12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cloud: 'M7 18h10.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 7.2 10 4 4 0 0 0 7 18z',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20.3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z',
  trash: 'M4 7h16M9 7V4.8h6V7M6.5 7l.8 12.3a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15z M5 17.5h14',
  shop: 'M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v10a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5v-10M4 9.5a2.7 2.7 0 0 0 4 0 2.7 2.7 0 0 0 4 0 2.7 2.7 0 0 0 4 0 2.7 2.7 0 0 0 4 0',
  wallet: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h13a1.5 1.5 0 0 1 1.5 1.5V9M3.5 7.5v10A1.5 1.5 0 0 0 5 19h14a1.5 1.5 0 0 0 1.5-1.5V12H16a2 2 0 0 0 0 4h4.5',
  calc: 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5v15A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h7',
  chart: 'M4 20V4M4 20h16M8 16.5v-5M12.5 16.5v-9M17 16.5v-3',
  people: 'M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z M2.5 20a6.5 6.5 0 0 1 13 0 M16.2 5.2a3.2 3.2 0 0 1 0 6.2M18 14.4a6.2 6.2 0 0 1 3.5 5.6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2',
}

export function Icon({ name, size = 22, stroke = 1.8 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  const d = paths[name] || ''
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(' M').map((seg, i) => <path key={i} d={i === 0 ? seg : 'M' + seg} />)}
    </svg>
  )
}

/* ---------- shell ---------- */

export function TopBar({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack && (
        <button className="iconbtn" onClick={onBack} aria-label={t('ফিরে যান')}><Icon name="back" /></button>
      )}
      <h1>{t(title)}{sub && <span className="sub">{tr(sub)}</span>}</h1>
      {right}
    </div>
  )
}

export function Pick({ on, title, sub, right, onClick, disabled }: {
  on?: boolean; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button className={'pick' + (on ? ' on' : '')} onClick={onClick} disabled={disabled}>
      <span className="t">{tr(title)}{sub && <span className="s">{tr(sub)}</span>}</span>
      {right}
    </button>
  )
}

export function CheckPick({ on, title, sub, right, onClick }: {
  on: boolean; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick: () => void
}) {
  return (
    <button className={'pick' + (on ? ' on' : '')} onClick={onClick}>
      <span className="check">{on && <Icon name="check" size={16} stroke={2.6} />}</span>
      <span className="t">{tr(title)}{sub && <span className="s">{tr(sub)}</span>}</span>
      {right && <span className="r">{right}</span>}
    </button>
  )
}

export function Chip({ on, children, onClick, sub }: { on?: boolean; children: ReactNode; onClick?: () => void; sub?: string }) {
  return (
    <button className={'chip' + (on ? ' on' : '')} onClick={onClick}>
      {tr(children)}{sub && <span className="sub">{t(sub)}</span>}
    </button>
  )
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        {title && <h2>{t(title)}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Toast({ text }: { text: string }) {
  return <div className="toast">{t(text)}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{tr(children)}</div>
}

/* ---------- money entry ----------
   A keypad rather than the system keyboard: he never has to decide whether
   the app wants ১২৫০ or 1250, and the buttons are the size of his thumb. */

export function MoneyPad({ value, onChange, prefix = '₹', allowDecimal = false, chips, onChipTaken }: {
  value: string
  onChange: (v: string) => void
  prefix?: string
  allowDecimal?: boolean
  chips?: number[]
  onChipTaken?: () => void
}) {
  const press = (k: string) => {
    if (navigator.vibrate) navigator.vibrate(8)
    if (k === 'del') return onChange(value.slice(0, -1))
    if (k === 'clr') return onChange('')
    if (k === '.') { if (!allowDecimal || value.includes('.')) return; return onChange((value || '0') + '.') }
    if (value.replace('.', '').length >= 9) return
    if (value === '0' && k === '0') return
    onChange(value === '0' ? k : value + k)
  }
  const shown = value ? groupIndian(Number(value.endsWith('.') ? value + '0' : value || '0')) : ''
  const display = value.endsWith('.') ? shown + '.' : shown
  return (
    <div>
      <div className={'moneyfield num' + (value ? '' : ' empty')}>
        <span className="cur">{prefix}</span>
        <span>{value ? toBn(display) : '০'}</span>
        <span className="caret" />
      </div>
      {chips && chips.length > 0 && (
        <div className="chips" style={{ margin: '.3rem 0 .9rem', justifyContent: 'center' }}>
          {chips.map((c) => (
            <Chip key={c} onClick={() => { onChange(String(c)); onChipTaken?.() }}>{prefix}{toBn(groupIndian(c))}</Chip>
          ))}
        </div>
      )}
      <div className="pad">
        {['1','2','3','4','5','6','7','8','9'].map((k) => (
          <button key={k} onClick={() => press(k)}>{toBn(k)}</button>
        ))}
        <button className="fn" onClick={() => press(allowDecimal ? '.' : 'clr')}>{allowDecimal ? '.' : t('মুছুন')}</button>
        <button onClick={() => press('0')}>{toBn('0')}</button>
        <button className="fn" onClick={() => press('del')} aria-label={t('একটা মুছুন')}><Icon name="back" size={20} /></button>
      </div>
    </div>
  )
}

/** Text field that accepts Bengali or ASCII digits and reports a number. */
export function NumField({ value, onChange, placeholder, decimal }: {
  value: number | null; onChange: (n: number | null) => void; placeholder?: string; decimal?: boolean
}) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) { last.current = value; setRaw(value == null ? '' : String(value)) }
  }, [value])
  return (
    <input
      className="input num"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={raw}
      placeholder={placeholder && t(placeholder)}
      onChange={(e) => {
        setRaw(e.target.value)
        const n = parseNum(e.target.value)
        last.current = n
        onChange(n)
      }}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{t(label)}</label>{children}</div>
}

export function useToast() {
  const [msg, setMsg] = useState('')
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (m: string, ms = 2400) => {
    setMsg(m)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setMsg(''), ms)
  }
  useEffect(() => () => { if (t.current) clearTimeout(t.current) }, [])
  return { msg, show }
}
