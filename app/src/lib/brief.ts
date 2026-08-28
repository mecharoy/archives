/* The nightly file: fetch it, distrust it, and have something to show when
   it isn't there. The app renders only the keys below and ignores the rest,
   so the night someone adds a field nothing breaks; and if the file is more
   than thirty-six hours old it says so rather than passing stale numbers off
   as today's. */

import { kvSet } from './db'
import { getState, setState, apiUrl, type Brief, type Status, activeProjects, stages, coeffs, allItems, nameOf } from './store'
import { cashState, duesSplit, projectTotals, projectBurn, shopStock, entriesInLastDays, liveEntries } from './calc'
import { hoursSince, isoDate, daysBetween, addDays, money, toBn } from './bn'
import type { Entry, StockEntry } from './model'
import { t, tf } from './i18n'

export const STALE_HOURS = 36

const STATUSES: Status[] = ['ok', 'warn', 'crit', 'info']
const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '')
const numOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const st = (v: unknown): Status => (STATUSES.includes(v as Status) ? (v as Status) : 'info')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Whitelist and clamp. A malformed field is dropped, never rendered raw. */
export function parseBrief(raw: unknown): Brief | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const generated_at = str(o.generated_at, 40)
  if (!generated_at || !Number.isFinite(new Date(generated_at).getTime())) return null
  const series = (o.series || {}) as Record<string, unknown>
  const sc = (series.scurve || {}) as Record<string, unknown>
  const numbers = (v: unknown) => arr(v).map((x) => numOr(x, 0)).slice(0, 200)
  const days = numbers(sc.days)
  const plan = numbers(sc.plan)
  const actual = numbers(sc.actual)
  return {
    generated_at,
    headline_bn: str(o.headline_bn),
    headline_en: str(o.headline_en),
    cards: arr(o.cards).slice(0, 6).map((c) => {
      const x = c as Record<string, unknown>
      return {
        label_bn: str(x.label_bn, 40), label_en: str(x.label_en, 40),
        value: str(x.value, 24),
        sub_bn: str(x.sub_bn, 60), sub_en: str(x.sub_en, 60), status: st(x.status),
      }
    }).filter((c) => c.label_bn),
    projects: arr(o.projects).slice(0, 12).map((p) => {
      const x = p as Record<string, unknown>
      return {
        name_bn: str(x.name_bn, 60), name_en: str(x.name_en, 60),
        pct_done: Math.max(0, Math.min(100, numOr(x.pct_done, 0))),
        pct_spent: Math.max(0, Math.min(999, numOr(x.pct_spent, 0))),
        status: st(x.status), note_bn: str(x.note_bn, 200), note_en: str(x.note_en, 200),
      }
    }).filter((p) => p.name_bn),
    alerts: arr(o.alerts).slice(0, 10).map((a) => {
      const x = a as Record<string, unknown>
      return { severity: st(x.severity), text_bn: str(x.text_bn), text_en: str(x.text_en) }
    }).filter((a) => a.text_bn),
    series: {
      scurve: days.length > 1 && plan.length === days.length && actual.length <= days.length
        ? { days, plan, actual, unit: str(sc.unit, 12) || 'lakh' } : undefined,
      burn: arr(series.burn).slice(0, 12).map((b) => {
        const x = b as Record<string, unknown>
        return { item_bn: str(x.item_bn, 40), item_en: str(x.item_en, 40), pct: Math.max(0, Math.min(400, numOr(x.pct, 0))), status: st(x.status) }
      }).filter((b) => b.item_bn),
    },
    todo_bn: arr(o.todo_bn).slice(0, 10).map((t) => str(t)).filter(Boolean),
    todo_en: arr(o.todo_en).slice(0, 10).map((t) => str(t)).filter(Boolean),
  }
}

export function briefAgeHours(b: Brief | null): number {
  return b ? hoursSince(b.generated_at) : Infinity
}

export function briefIsStale(b: Brief | null): boolean {
  return briefAgeHours(b) > STALE_HOURS
}

export async function fetchBrief(silent = true): Promise<string> {
  const s = getState()
  // Served beside the data it describes; an explicit URL is only an override.
  const url = s.settings.briefUrl.trim() || apiUrl('/brief.json')
  if (!url) return silent ? '' : t('সেটিংসে ঠিকানা দেওয়া নেই')
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)
    const headers: Record<string, string> = {}
    const auth = s.settings.briefToken || s.settings.token
    if (auth) headers['Authorization'] = 'Bearer ' + auth
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { headers, signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (res.status === 404) return silent ? '' : t('রাতের হিসাব এখনও তৈরি হয়নি')
    if (!res.ok) return tf('ব্রিফ পাওয়া গেল না ({0})', res.status)
    const parsed = parseBrief(await res.json())
    if (!parsed) return t('ব্রিফের ফাইলটা ঠিক নেই')
    const at = new Date().toISOString()
    await kvSet('brief', parsed)
    await kvSet('brief_fetched_at', at)
    setState({ brief: parsed, brief_fetched_at: at })
    return ''
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return /abort/i.test(m) ? t('সময় শেষ') : t('ব্রিফ আনা গেল না')
  }
}

/* ---- the fallback ----
   When the file is missing or stale the screen is never blank. These are the
   phone's own sums over his own entries, labelled as such. */

export function localBrief(): Brief {
  const s = getState()
  const es = s.entries
  const cash = cashState(es, s.settings.opening_cash, s.settings.opening_date)
  const dues = duesSplit(es)
  const stock = shopStock(es, allItems(s))
  const stockValue = stock.reduce((a, l) => a + l.value, 0)
  const active = activeProjects(s)
  const st = stages(s)
  const cf = coeffs(s)
  const entered3 = entriesInLastDays(es, 3)

  const counted = es.some((e) => e.kind === 'day' && e.cash_counted != null) || s.settings.opening_cash > 0
  const cards: NonNullable<Brief['cards']> = [
    counted
      ? { label_bn: t('হাতে টাকা'), value: money(cash.computed), sub_bn: tf('{0} দিন আগে গোনা', toBn(daysBetween(cash.anchor_date, isoDate()))), status: cash.computed < 0 ? 'crit' : 'ok' }
      : { label_bn: t('হাতে টাকা'), value: '—', sub_bn: t('একবার গুনে বসিয়ে দিন'), status: 'info' },
    { label_bn: t('বাকি দেনা'), value: money(dues.total), sub_bn: dues.overdue > 0 ? tf('{0} সময় পেরিয়েছে', money(dues.overdue)) : t('সময়ের মধ্যে'), status: dues.overdue > 0 ? 'crit' : dues.thisWeek > 0 ? 'warn' : 'ok' },
    { label_bn: t('দোকানের মজুত'), value: money(stockValue), sub_bn: tf('{0} রকম মাল', toBn(stock.length)), status: 'info' },
    { label_bn: t('এ মাসের খরচ'), value: money(monthSpend(es)), sub_bn: t('চলতি মাস'), status: 'info' },
  ]

  const projs = active.map((p) => {
    const t = projectTotals(p, es, st)
    return { name_bn: p.name_bn, pct_done: t.pct_done, pct_spent: t.pct_spent, status: t.status, note_bn: t.flag_bn }
  })

  const alerts: NonNullable<Brief['alerts']> = []
  if (entered3 === 0) alerts.push({ severity: 'crit', text_bn: t('তিন দিন কোনো হিসাব লেখা হয়নি।') })
  if (dues.overdue > 0) alerts.push({ severity: 'crit', text_bn: tf('{0} দেনার সময় পেরিয়ে গেছে।', money(dues.overdue)) })
  else if (dues.thisWeek > 0) alerts.push({ severity: 'warn', text_bn: tf('এ সপ্তাহে {0} দিতে হবে।', money(dues.thisWeek)) })
  for (const p of active) {
    const t = projectTotals(p, es, st)
    if (t.cpi != null && t.cpi < 1 && t.cost > 0) alerts.push({ severity: 'warn', text_bn: tf('{0}: কাজের তুলনায় খরচ বেশি হচ্ছে।', p.name_bn) })
  }

  const main = active[0]
  const burnRows = main
    ? projectBurn(main, es, cf, projectTotals(main, es, st).pct_done)
        .filter((b) => b.est > 0)
        .slice(0, 6)
        .map((b) => ({ item_bn: t(nameOf(s, b.item_id)), pct: b.pct, status: b.status as Status }))
    : []

  return {
    generated_at: new Date().toISOString(),
    headline_bn: alerts[0]?.text_bn || (active.length ? t('সব ঠিক চলছে।') : t('একটা কাজ যোগ করে শুরু করুন।')),
    cards, projects: projs, alerts,
    series: { scurve: main ? sCurve(main.id) : undefined, burn: burnRows },
    todo_bn: dues.all.slice(0, 4).map((d) => `${nameOf(s, d.party_id) || t('দোকান')} — ${money(d.amount)}, ${d.due_date}`),
  }
}

export function monthSpend(es: Entry[]): number {
  const from = isoDate().slice(0, 8) + '01'
  let total = 0
  for (const e of es) {
    if (e.date < from) continue
    if (e.kind === 'attendance') total += e.amount + e.advance
    else if (e.kind === 'stock' && (e.dir === 'in' || e.dir === 'transfer')) total += e.amount
    else if (e.kind === 'money' && e.dir === 'paid' && !e.personal) total += e.amount
  }
  return total
}

/** Cumulative spend against a straight-line plan, in lakh. */
export function sCurve(projectId: string): NonNullable<NonNullable<Brief['series']>['scurve']> | undefined {
  const s = getState()
  const p = activeProjects(s).find((x) => x.id === projectId)
  if (!p || !p.start_date) return undefined
  const today = isoDate()
  const span = Math.max(1, daysBetween(p.start_date, today))
  const planDays = p.plan_days && p.plan_days > 0 ? p.plan_days : Math.max(span, 90)
  const steps = 6
  const days: number[] = []
  const plan: number[] = []
  const actual: number[] = []
  const es = liveEntries(s.entries).filter((e) => e.project_id === p.id)
  for (let i = 0; i <= steps; i++) {
    const d = Math.round((span * i) / steps)
    const upto = addDays(p.start_date, d)
    days.push(d)
    plan.push(round2(((p.budget || 0) * Math.min(1, d / planDays)) / 100000))
    let c = 0
    for (const e of es) {
      if (e.date > upto) continue
      if (e.kind === 'attendance') c += e.amount
      else if (e.kind === 'stock' && (e.dir === 'in' || e.dir === 'transfer')) c += e.amount
      else if (e.kind === 'money' && e.dir === 'paid' && !e.personal) c += e.amount
    }
    actual.push(round2(c / 100000))
  }
  if ((p.budget || 0) <= 0) return undefined
  return { days, plan, actual, unit: 'lakh' }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function unpaidStockCount(es: Entry[]): number {
  return (liveEntries(es).filter((e) => e.kind === 'stock') as StockEntry[]).filter((s) => (s.dir === 'in' || s.dir === 'transfer') && !s.paid).length
}
