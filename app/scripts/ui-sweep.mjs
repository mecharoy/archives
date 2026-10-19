/* A walk through every screen of the app, on a phone-sized screen, looking for the things a
   text-only test cannot see: words cut off, things sticking out of the screen, buttons too
   small to hit, grey on white that cannot be read, a bar that hides the last row.

   It seeds a believable ledger (long Bengali names on purpose), then for each combination of
   language / screen width / text size / light-dark, walks the four tabs and every screen opened from
   them, setup on an empty phone, and the evening at each of its questions with two jobs and the shop's
   men in it. It opens each screen, takes a picture
   (scripts/shot-ui-*.png) and runs the same checks in the page. The findings are listed once per
   kind, with the screens and combinations they show up in (scripts/ui-report/latest.md).

   UI_COMBOS=bn-360,en-360 UI_ONLY=settings npm run ui:sweep      PW_CHROMIUM=<path> if needed */

process.env.TZ = 'Asia/Kolkata'

import { chromium } from 'playwright'
import { createServer } from 'vite'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadApp, ROOT } from './_app.mjs'
import { demoData } from './_demo.mjs'

const COMBOS = {
  'bn-360': { w: 360, h: 780, lang: 'bn', scale: 1.12, theme: 'light' },
  'bn-360-small': { w: 360, h: 780, lang: 'bn', scale: 1, theme: 'light' },
  'bn-320': { w: 320, h: 640, lang: 'bn', scale: 1, theme: 'light' },
  'bn-360-big': { w: 360, h: 780, lang: 'bn', scale: 1.26, theme: 'light' },
  'bn-320-big': { w: 320, h: 640, lang: 'bn', scale: 1.26, theme: 'light' },
  'en-360': { w: 360, h: 780, lang: 'en', scale: 1.12, theme: 'light' },
  'bn-360-dark': { w: 360, h: 780, lang: 'bn', scale: 1.12, theme: 'dark' },
}
const WANT = (process.env.UI_COMBOS || 'bn-360,bn-320-big,en-360,bn-360-dark').split(',')
const ONLY = process.env.UI_ONLY ? process.env.UI_ONLY.split(',') : null
const OUT = join(ROOT, 'scripts')
const PORT = 5231

const app = await loadApp()
// Building those modules leaves NODE_ENV at 'production'; the screens below are the development server's
// (the crash screen and the shell's test hook exist only there).
process.env.NODE_ENV = 'development'
const today = app.bn.isoDate()
const demo = demoData(app, today)

/* A second running job, of another kind and with a long name, so the evening has two jobs to walk. */
const JOB2 = { id: 'p-sweep2', kind: 'project', name_bn: 'দত্তবাবুর দোতলা বাড়ির রঙের কাজ', client_bn: '', ptype: 'রং', area_sqft: null, budget: 350000, start_date: today, plan_days: null, status: 'active', updated_at: new Date().toISOString() }
const MASTERS = [...demo.masters, JOB2]
const HELPER = 'অমল'

/* His own words — names, units, notes, the website's enquiries, the helper's name — are Bengali on every screen
   by design; so are three on purpose: বাংলা (the language's own name on its button), the reset word he types, and
   the sample of Bengali digits on the language page. */
const KNOWN = [...new Set([
  ...MASTERS.flatMap((m) => [m.name_bn, m.unit_bn, m.client_bn, m.to_bn, m.ptype]),
  HELPER, 'বাংলা', 'মুছে দিন', '১,২৫০',
  ...demo.entries.flatMap((e) => [e.head_bn, e.note]),
  ...demo.enquiries.flatMap((q) => [q.name, q.location, q.service, q.message]),
].filter((x) => typeof x === 'string' && x.length > 1))].sort((a, b) => b.length - a.length)

const server = await createServer({ server: { port: PORT }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})

/* ---------- what is checked, run inside the page ---------- */

const AUDIT = ({ lang, known }) => {
  const out = []
  const vw = document.documentElement.clientWidth
  const sel = (e) => (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : e.tagName.toLowerCase())
  const textOf = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const add = (type, e, detail = '') => out.push({ type, sel: sel(e), text: textOf(e), detail })

  if (document.documentElement.scrollWidth > vw + 1) out.push({ type: 'page wider than the screen', sel: 'html', text: '', detail: `${document.documentElement.scrollWidth}px on a ${vw}px screen` })

  /* colour maths for contrast */
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 1] }
  const over = (top, under) => { const a = top[3] ?? 1; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const backdrop = (e) => {
    const layers = []
    for (let n = e; n; n = n.parentElement) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg.length >= 3 && (bg[3] ?? 1) > 0) layers.push(bg); if ((bg[3] ?? 1) >= 1) break }
    let base = [255, 255, 255, 1]
    for (const l of layers.reverse()) base = over(l, base)
    return base
  }

  // On an English screen, Bengali that is not his own data is a sentence nobody translated.
  if (lang === 'en') {
    const walker = document.createTreeWalker(document.querySelector('.app'), NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let txt = n.textContent
      for (const k of known) if (k && txt.includes(k)) txt = txt.split(k).join('')
      if (/[ঀ-৿]/.test(txt) && n.parentElement && getComputedStyle(n.parentElement).display !== 'none') add('Bengali left on an English screen', n.parentElement, txt.trim().slice(0, 50))
    }
  }

  const all = [...document.querySelectorAll('.app *')]
  for (const e of all) {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const r = e.getBoundingClientRect()
    if (!r.width && !r.height) continue
    if (e.closest('.tour')) continue

    if ((r.right > vw + 1 || r.left < -1) && !e.closest('.chips, .hscroll, [data-scrollx]')) add('sticks out of the screen', e, `${Math.round(r.left)}…${Math.round(r.right)} of ${vw}`)

    const hidden = cs.overflowX === 'hidden' || cs.overflow === 'hidden'
    if (hidden && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== 'ellipsis') add('text cut off at the side', e, `${e.scrollWidth}px in ${e.clientWidth}px`)
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) add('text replaced by …', e)
    const lines = parseFloat(cs.webkitLineClamp || '0')
    if (hidden && !e.children.length && e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 2) add('text cut off at the bottom', e, `${e.scrollHeight}px in ${e.clientHeight}px`)
    if (lines > 0 && e.scrollHeight > e.clientHeight + 2) add('text cut off by a line limit', e)

    if (e.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], .pick, .tile, .chip, .iconbtn') && !e.disabled) {
      if (r.height < 44 || r.width < 44) add('too small to hit (under 44px)', e, `${Math.round(r.width)}×${Math.round(r.height)}`)
    }

    // Words you cannot read.
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (own) {
      const fg = parse(cs.color)
      const bg = backdrop(e)
      const c = ratio(over(fg, bg), bg)
      const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700
      const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5
      if (c < need) add('hard to read (contrast under 4.5:1)', e, `${hex(over(fg, bg))} on ${hex(bg)} = ${c.toFixed(1)}:1`)
      if (px < 11.5) add('text under 11.5px', e, `${px.toFixed(1)}px`)
    }

    // A bar that never fills (the old .barfill bug): a track with a fill that has no width.
    if (/barfill/.test(typeof e.className === 'string' ? e.className : '') && r.width === 0 && e.parentElement && e.parentElement.getBoundingClientRect().width > 0 && e.style.width && e.style.width !== '0%') add('bar fill has no width', e)
  }

  // The bottom bar must not hide the last thing in a list.
  const bars = all.filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return (cs.position === 'fixed' || cs.position === 'sticky') && r.height > 20 && r.height < 200 && r.bottom >= innerHeight - 2 && r.top > innerHeight / 2 })
  const sc = document.querySelector('.scroll')
  if (bars.length && sc) {
    const saved = sc.scrollTop
    sc.scrollTop = sc.scrollHeight
    const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top))
    let lowest = 0, who = null
    for (const e of sc.querySelectorAll('*')) { const r = e.getBoundingClientRect(); const p = getComputedStyle(e).position; if (r.height && r.bottom > lowest && p !== 'fixed' && p !== 'sticky') { lowest = r.bottom; who = e } }
    if (who && lowest > barTop + 1) add('last row hidden under the bottom bar', who, `ends ${Math.round(lowest)}, bar starts ${Math.round(barTop)}`)
    sc.scrollTop = saved
  }
  return out
}

/* ---------- driving the app ---------- */

const findings = new Map()      // key -> { name, type, sel, detail, text, n, where: Set }
const problems = []             // console / page errors, and screens the walk could not reach
let shots = 0

async function seed(page, combo, extra = {}) {
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForSelector('.app')
  await page.evaluate(async ({ masters, entries, brief, enquiries, settings, draft }) => {
    const db = await import('/src/lib/db.ts')
    for (const s of ['masters', 'entries', 'outbox', 'kv']) await db.dbClear(s)
    await db.dbPutMany('masters', masters)
    await db.dbPutMany('entries', entries)
    await db.kvSet('settings', settings)
    if (brief) { await db.kvSet('brief', brief); await db.kvSet('brief_fetched_at', new Date().toISOString()) }
    await db.kvSet('enquiries', enquiries)
    if (draft) await (await import('/src/lib/draft.ts')).saveDraft(draft)
  }, extra.setup ? {
    // An empty phone: setup asks everything.
    masters: [], entries: [], brief: null, enquiries: [], draft: null,
    settings: { lang: combo.lang, theme: combo.theme, text_scale: combo.scale },
  } : {
    masters: MASTERS, entries: demo.entries, brief: demo.brief, enquiries: demo.enquiries, draft: extra.draft || null,
    settings: { onboarded: true, toured: true, lang: combo.lang, theme: combo.theme, text_scale: combo.scale, runs_shop: true, runs_sites: true, remind: 'day', helper_name: HELPER, helper_phone: '90000 11111' },
  })
  await page.reload()
  await page.waitForSelector(extra.setup ? '.app[data-screen="setup"]' : '.app .tabbar', { timeout: 15000 })
  await page.waitForTimeout(350)
}

async function look(page, comboName, name) {
  if (ONLY && !ONLY.some((o) => name.includes(o))) return
  await page.waitForTimeout(220)
  const found = await page.evaluate(AUDIT, { lang: COMBOS[comboName].lang, known: KNOWN })
  for (const f of found) {
    const key = `${name}|${f.type}|${f.sel}|${f.detail}`
    if (!findings.has(key)) findings.set(key, { name, type: f.type, sel: f.sel, detail: f.detail, text: f.text, n: 0, where: new Set() })
    const g = findings.get(key); g.n++; g.where.add(comboName)
  }
  await page.screenshot({ path: join(OUT, `shot-ui-${comboName}-${name}.png`) })
  shots++
  // A long screen is looked at at the bottom as well.
  const more = await page.evaluate(() => { const s = document.querySelector('.scroll'); if (!s || s.scrollHeight <= s.clientHeight + 40) return false; s.scrollTop = s.scrollHeight; return true })
  if (more) { await page.waitForTimeout(120); await page.screenshot({ path: join(OUT, `shot-ui-${comboName}-${name}-end.png`) }); shots++ }
}

/* The evening with two jobs and the shop's men: wages of three kinds, material bought and returned, spending,
   money for a job, the slider moved on one job and not the other, goods for the shop, his own spending, and a
   cash count that does not match. */
const jobIds = MASTERS.filter((m) => m.kind === 'project' && m.status === 'active').map((m) => m.id)
const menIds = MASTERS.filter((m) => m.kind === 'worker').map((m) => m.id)
const mats = MASTERS.filter((m) => m.kind === 'item').slice(0, 2)
const att = (presence, rate, amount, advance = 0) => ({ presence, rate, amount, advance })
const dr = app.draft.newDraft(today, [jobIds[0], jobIds[1], ''])
dr.picked = true
dr.sites[0] = {
  ...dr.sites[0], att_seeded: true, pct: 45,
  att: { [menIds[0]]: att('full', 700, 700), [menIds[1]]: att('half', 500, 250, 100) },
  mats: mats.map((m, i) => ({ key: 'k' + i, item_id: m.id, qty: 40 + i, rate: 400, party_id: 's0', due_date: app.bn.addDays(today, -5), paid: i === 0, photo_id: '' })),
  rets: [{ key: 'r1', item_id: mats[0].id, qty: 3, rate: 400 }],
  exps: [{ key: 'x1', head_bn: 'চা-জলখাবার', amount: 120, mode: 'নগদ', note: '', photo_id: '' }, { key: 'x2', head_bn: 'গাড়ি ভাড়া', amount: 1500, mode: 'UPI', note: 'ট্রাক', photo_id: '' }],
}
dr.sites[1] = { ...dr.sites[1], att_seeded: true, att: { [menIds[2]]: att('ot', 600, 900) } }
dr.sites[2] = { ...dr.sites[2], att_seeded: true }
dr.recv = [{ key: 'rc1', project_id: jobIds[0], amount: 25000, mode: 'UPI' }]
dr.pexps = [{ key: 'p1', head_bn: 'বাজার', amount: 800, mode: 'নগদ', note: '', photo_id: '' }]
dr.invs = [{ key: 'v1', item_id: mats[1].id, qty: 20, rate: 120, party_id: 's1', due_date: '', paid: true, photo_id: '' }]
dr.cash_counted = 43800; dr.cash_computed = 48000
const EVENING = app.day.daySteps({ draft: dr, jobs: jobIds.length, hasMen: menIds.length > 0, runsShop: true })

for (const comboName of WANT) {
  const combo = COMBOS[comboName]
  const ctx = await browser.newContext({ viewport: { width: combo.w, height: combo.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: combo.theme })
  const page = await ctx.newPage()
  const PRETEND = ['https://generativelanguage.googleapis.com', 'https://worker.test']
  page.on('pageerror', (e) => problems.push(`${comboName}: PAGEERROR ${e.message}`))
  // The crash screen is opened on purpose below; React logs the crash it shows.
  page.on('console', (m) => { if (m.type() === 'error' && !PRETEND.some((o) => (m.location().url || '').startsWith(o)) && !m.text().includes('crash test')) problems.push(`${comboName}: CONSOLE ${m.text().slice(0, 160)}`) })
  await page.route('**/latest.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versionCode: 1, versionName: '1.0.1', url: 'https://example.invalid/x.apk', notes_bn: '', notes_en: '' }) }))

  /* Every screen is reached from a fresh start on its tab — the screens keep their own little back-stacks, and a
     sweep must not depend on them — and by position, not by its words, so the English pass walks the same way. */
  await seed(page, combo)
  const fresh = async () => { await page.reload(); await page.waitForSelector('.app .tabbar', { timeout: 15000 }); await page.waitForTimeout(250) }
  const toTab = async (k) => { await fresh(); if (k) { await page.locator('.tabbar button').nth(k).click(); await page.waitForTimeout(250) } }
  const more = (k) => page.locator('.rowlist').last().locator('.pick').nth(k)
  const go = (loc, name) => loc.click({ timeout: 4000 }).then(() => page.waitForTimeout(250)).catch(() => problems.push(`${comboName}: could not open ${name}`))
  const plus = async (name) => {
    const b = page.locator('.topbar .iconbtn[aria-label="নতুন"]')
    if (await b.count()) { await b.click(); await page.waitForTimeout(300); await look(page, comboName, name + '-new') }
  }

  // the four tabs
  for (const [k, nm] of [[0, 'today'], [1, 'work'], [2, 'shop'], [3, 'money']]) { await toTab(k); await look(page, comboName, nm) }

  // আজ → Settings, both groups, and each page (the walk round, row 4, leaves Settings, so it is not opened)
  const openSettings = async () => { await toTab(0); await go(page.locator('.topbar .iconbtn[aria-label]').last(), 'settings') }
  await openSettings(); await look(page, comboName, 'settings')
  for (const [k, nm] of [[0, 'set-me'], [1, 'set-display'], [2, 'set-remind'], [3, 'set-lang'], [5, 'set-sync'], [6, 'set-ai'], [7, 'set-runs'], [8, 'set-backup'], [9, 'set-update'], [10, 'set-pin'], [11, 'set-reset']]) {
    await openSettings(); await go(page.locator('.scroll .pick').nth(k), nm); await look(page, comboName, nm)
  }

  // কাজ: the price of a new job (and its size question), website enquiries, a new job, a job's card, and আরও
  await toTab(1); await go(page.locator('.tile').nth(0), 'estimate'); await look(page, comboName, 'estimate')
  await go(page.locator('.chips .chip').first(), 'estimate-size'); await look(page, comboName, 'estimate-size')
  await toTab(1); await go(page.locator('.tile').nth(1), 'enquiries'); await look(page, comboName, 'enquiries')
  await toTab(1); await go(page.locator('.scroll button.btn.quiet').filter({ hasText: '+' }).first(), 'work-newjob'); await look(page, comboName, 'work-newjob')
  await toTab(1); await go(page.locator('button.jobcard').first(), 'work-jobcard'); await look(page, comboName, 'work-jobcard')
  for (const [k, nm] of [[0, 'workers'], [1, 'stages'], [2, 'projects'], [3, 'history']]) {
    await toTab(1); await go(more(k), nm); await look(page, comboName, nm)
    if (nm === 'workers' || nm === 'projects') await plus(nm)
  }

  // দোকান: its three tiles, its two chips, and আরও
  for (const [k, nm] of [[0, 'shop-credit'], [1, 'shop-sale'], [2, 'shop-in']]) { await toTab(2); await go(page.locator('.tile').nth(k), nm); await look(page, comboName, nm) }
  for (const [k, nm] of [[0, 'shop-count'], [1, 'shop-transfer']]) { await toTab(2); await go(page.locator('.tilegrid + .chips .chip').nth(k), nm); await look(page, comboName, nm) }
  for (const [k, nm] of [[0, 'items'], [1, 'parties'], [2, 'fullcount']]) {
    await toTab(2); await go(more(k), nm); await look(page, comboName, nm)
    if (nm !== 'fullcount') await plus(nm)
  }

  // টাকা: money that came in, his own book, the cash count, and the paper khata's old balances
  for (const [k, nm] of [[0, 'money-received'], [1, 'personal'], [2, 'cash']]) { await toTab(3); await go(page.locator('.tile').nth(k), nm); await look(page, comboName, nm) }
  await toTab(3); await go(more(0), 'money-olddue'); await look(page, comboName, 'money-olddue')

  // the crash screen (development server only)
  await page.goto(`http://localhost:${PORT}/#crash-test`); await page.reload(); await page.waitForTimeout(500)
  await look(page, comboName, 'crash')
  await page.goto(`http://localhost:${PORT}/`)

  /* the evening, at each of its questions */
  for (const [k, st] of EVENING.entries()) {
    await seed(page, combo, { draft: { ...dr, at: st.key } })
    await page.locator('[data-tour="today"]').click()
    const opened = await page.waitForSelector('.wizhead', { timeout: 8000 }).then(() => true, () => false)
    if (!opened) problems.push(`${comboName}: the evening did not open at ${st.key}`)
    await look(page, comboName, 'eve-' + String(k + 1).padStart(2, '0') + '-' + st.key.replace(':', ''))
  }

  /* setup on an empty phone, a question at a time; the new-job sheet last, from its own walk */
  const next = async () => { await page.locator('.actionbar .btn.primary').click(); await page.waitForTimeout(300) }
  const toJobs = async () => {
    await seed(page, combo, { setup: true })
    await next()                                                     // শুরু করি
    await page.locator('input.input').first().fill('নিত্যানন্দ চক্রবর্তী')
    await next(); await next()                                       // the name; what he does
  }
  await seed(page, combo, { setup: true }); await look(page, comboName, 'setup-1-welcome')
  await next(); await page.locator('input.input').first().fill('নিত্যানন্দ চক্রবর্তী'); await look(page, comboName, 'setup-2-name')
  await next(); await look(page, comboName, 'setup-3-work')
  await next(); await look(page, comboName, 'setup-4-jobs')
  await next(); await look(page, comboName, 'setup-5-men')
  await next(); await look(page, comboName, 'setup-6-cash')
  await next(); await look(page, comboName, 'setup-7-notify')
  await toJobs(); await go(page.locator('.rowlist .pick').last(), 'setup-newjob'); await look(page, comboName, 'setup-4-newjob')
  await ctx.close()
}

await browser.close()
await server.close()

/* ---------- the list ---------- */

/* One line per (kind of problem, element, detail), with the screens it shows on — not one per word. */
const grouped = new Map()
for (const f of findings.values()) {
  const key = `${f.type}|${f.sel}|${f.detail.replace(/\d+px/g, 'Npx').replace(/-?\d+…\d+/g, 'a…b')}`
  if (!grouped.has(key)) grouped.set(key, { type: f.type, sel: f.sel, detail: f.detail, text: f.text, screens: new Set(), combos: new Set(), n: 0 })
  const g = grouped.get(key); g.screens.add(f.name); f.where.forEach((c) => g.combos.add(c)); g.n += f.n
}
const byType = new Map()
for (const g of grouped.values()) { if (!byType.has(g.type)) byType.set(g.type, []); byType.get(g.type).push(g) }
const lines = []
for (const [type, list] of [...byType].sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`\n## ${type} (${list.length} kinds)`)
  for (const g of list.sort((a, b) => b.screens.size - a.screens.size).slice(0, 30)) {
    lines.push(`- ${g.sel}  ${g.detail}  e.g. "${g.text}"  on ${[...g.screens].slice(0, 8).join(', ')}${g.screens.size > 8 ? ` +${g.screens.size - 8}` : ''}  {${[...g.combos].join(', ')}}`)
  }
}
mkdirSync(join(OUT, 'ui-report'), { recursive: true })
const report = `UI sweep: ${shots} pictures, ${grouped.size} kinds of finding (${findings.size} distinct), ${problems.length} console problems\n${lines.join('\n')}\n\n## console\n${[...new Set(problems)].join('\n')}\n`
writeFileSync(join(OUT, 'ui-report', 'latest.md'), report)
console.log(report.slice(0, 24000))
