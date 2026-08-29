import { useState } from 'react'
import { toBn, num } from '../lib/bn'
import type { Brief, Status } from '../lib/store'
import { t, tf } from '../lib/i18n'

/* Two charts, both drawn as plain SVG against CSS variables so they follow
   the theme and print legibly. Nothing animates; he is reading, not watching. */

export function SCurve({ data }: { data: NonNullable<NonNullable<Brief['series']>['scurve']> }) {
  const W = 320, H = 148, L = 30, R = 8, T = 10, B = 22
  const [hover, setHover] = useState<number | null>(null)
  const days = data.days
  const maxY = Math.max(...data.plan, ...data.actual, 1) * 1.12
  const maxX = Math.max(...days, 1)
  const x = (d: number) => L + (d / maxX) * (W - L - R)
  const y = (v: number) => T + (1 - v / maxY) * (H - T - B)
  const line = (vals: number[]) => vals.map((v, k) => `${x(days[k])},${y(v)}`).join(' ')
  const ticks = [0, maxY / 2, maxY]
  const last = data.actual.length - 1

  const pick = (e: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const cx = ('touches' in e ? e.touches[0]?.clientX : e.clientX) ?? 0
    const px = ((cx - rect.left) / rect.width) * W
    let best = 0
    days.forEach((d, k) => { if (Math.abs(x(d) - px) < Math.abs(x(days[best]) - px)) best = k })
    setHover(best)
  }

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={tf('পরিকল্পনার তুলনায় খরচ — এখন {0} {1}', data.actual[last], data.unit)}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="axis" x={L - 5} y={y(t) + 3.5} textAnchor="end">{toBn(t.toFixed(t > 10 ? 0 : 1))}</text>
          </g>
        ))}
        <text className="axis" x={L} y={H - 6}>{toBn(0)}</text>
        <text className="axis" x={W - R} y={H - 6} textAnchor="end">{tf('{0} দিন', toBn(maxX))}</text>
        <polyline className="plan" points={line(data.plan)} />
        <polyline className="actual" points={line(data.actual)} />
        {last >= 0 && <circle cx={x(days[last])} cy={y(data.actual[last])} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
        {hover != null && (
          <g>
            <line className="grid" x1={x(days[hover])} x2={x(days[hover])} y1={T} y2={H - B} stroke="var(--ink)" strokeDasharray="3 3" opacity=".5" />
            <circle cx={x(days[hover])} cy={y(data.actual[hover] ?? 0)} r={3.5} fill="var(--accent)" />
          </g>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent"
          onMouseMove={pick} onMouseLeave={() => setHover(null)} onTouchMove={pick} onTouchEnd={() => setHover(null)} />
      </svg>
      <div className="spread small muted" style={{ marginTop: '.3rem' }}>
        <span>{t("— — পরিকল্পনা")}</span>
        <span style={{ color: 'var(--accent)' }}>{t("—— আসল খরচ")}</span>
        <span className="num">
          {hover != null
            ? tf('{0} দিন · {1} / {2} লাখ', toBn(days[hover]), toBn(num(data.actual[hover] ?? 0, 1)), toBn(num(data.plan[hover] ?? 0, 1)))
            : tf('{0} লাখ খরচ', toBn(num(data.actual[last] ?? 0, 1)))}
        </span>
      </div>
    </div>
  )
}

export function BurnBars({ rows, done }: { rows: { item_bn: string; pct: number; status?: Status }[]; done: number }) {
  const max = Math.max(100, ...rows.map((r) => r.pct))
  return (
    <div style={{ position: 'relative' }}>
      {rows.map((r) => (
        <div className="barrow" key={r.item_bn}>
          <span className="name">{r.item_bn}</span>
          <span className="bartrack">
            <span className={'barfill ' + (r.status === 'crit' ? 'crit' : r.status === 'warn' ? 'warn' : '')}
              style={{ width: `${Math.min(100, (r.pct / max) * 100)}%` }} />
            <span className="barmark" style={{ left: `${Math.min(100, (done / max) * 100)}%` }} />
          </span>
          <span className="pct num">{toBn(Math.round(r.pct))}%</span>
        </div>
      ))}
      <p className="small muted" style={{ marginTop: '.5rem' }}>
        {tf('খাড়া দাগটা কাজের অগ্রগতি — {0}%। তার ডানদিকে যা আছে, কাজের তুলনায় সেটা বেশি খরচ হচ্ছে।', toBn(Math.round(done)))}
      </p>
    </div>
  )
}
