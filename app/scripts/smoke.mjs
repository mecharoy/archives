import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5199 } })
await server.listen()
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

const log = []
const step = async (name, fn) => {
  try { await fn(); log.push('ok   ' + name) }
  catch (e) {
    log.push('FAIL ' + name + ' :: ' + String(e).split('\n')[0])
    try {
      await page.screenshot({ path: 'scripts/fail-' + name.replace(/\W+/g, '-') + '.png' })
      log.push('     screen: ' + (await page.locator('.app').innerText()).replace(/\n+/g, ' | ').slice(0, 300))
    } catch {}
  }
}
const tap = async (text, opts = {}) => {
  const el = page.getByText(text, { exact: opts.exact ?? false }).first()
  await el.waitFor({ timeout: 4000 })
  await el.click()
}

/* The update check reaches out to the repository. Serve it here instead:
   the suite must not depend on the network, and a stub lets the newer-version
   path be exercised rather than only the 404 one. */
await page.route('**/latest.json*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    code: 999, name: '9.9.9',
    url: 'https://example.invalid/SiteKhata-1.0.apk?build=999',
    size: 7139772,
    notes_bn: 'পরীক্ষার সংস্করণ', notes_en: 'A test build',
  }),
}))

const pickItem = async (name) => {
  const shown = page.getByText(name, { exact: true }).first()
  if (!(await shown.count())) {
    const more = page.getByText('আরও…').first()
    if (await more.count()) { await more.click(); await page.waitForTimeout(300) }
  }
  await page.getByText(name, { exact: true }).first().click()
}

await page.goto('http://localhost:5199/')
await page.waitForTimeout(700)

await step('onboarding opens', async () => { await page.getByText('খাতাটা এবার ফোনে').waitFor({ timeout: 5000 }) })
await step('onboarding: start', async () => { await tap('শুরু করি') })
await step('onboarding: language', async () => {
  await page.getByText('কোন ভাষায় দেখতে চান?').waitFor({ timeout: 4000 })
  await page.locator('.pick').first().click()
  await tap('এগিয়ে যান')
})
await step('onboarding: about him', async () => {
  await page.getByText('আপনার নাম?').waitFor({ timeout: 4000 })
  await page.locator('input.input').first().fill('বিমল')
  await tap('এগিয়ে যান')
})
await step('onboarding: project', async () => {
  await page.getByText('এখন কোন কাজটা চলছে?').waitFor({ timeout: 4000 })
  await page.locator('input.input').first().fill('রামপুর বাড়ি')
  await page.locator('input.input').nth(1).fill('2800000')
  await tap('এগিয়ে যান')
})
await step('onboarding: workers', async () => {
  await page.getByText('কারা কাজ করে?').waitFor({ timeout: 4000 })
  await page.locator('input.input').nth(0).fill('রতন')
  await page.locator('input.input').nth(1).fill('600')
  await tap('+ আরও একজন')
  await page.locator('input.input').nth(2).fill('সুকুমার')
  await page.locator('input.input').nth(3).fill('550')
  await tap('এগিয়ে যান')
})
await step('onboarding: cash in hand', async () => {
  await page.getByText('এই মুহূর্তে হাতে কত টাকা আছে?').waitFor({ timeout: 4000 })
  await tap('হয়ে গেল')
  await page.getByText('আজকের হিসাব').first().waitFor({ timeout: 5000 })
})

await step('the tour opens by itself, first time', async () => {
  await page.locator('.tour').waitFor({ timeout: 5000 })
  const step1 = await page.locator('.tour-step').innerText()
  if (!/1 \/ 5/.test(step1)) throw new Error('expected 5 stops, got ' + step1)
})

await step('the spotlight sits over the thing it names', async () => {
  const wanted = ['today', 'brief', 'books', 'standing', 'all']
  for (let i = 0; i < wanted.length; i++) {
    const hole = await page.locator('.tour-hole').boundingBox()
    const el = await page.locator('[data-tour="' + wanted[i] + '"]').boundingBox()
    if (!hole || !el) throw new Error('stop ' + (i + 1) + ' (' + wanted[i] + ') has nothing to point at')
    /* The cut-out is the control plus 8px of padding on each side. */
    const off = Math.abs(hole.x + hole.width / 2 - (el.x + el.width / 2)) +
                Math.abs(hole.y + hole.height / 2 - (el.y + el.height / 2))
    if (off > 6) throw new Error('stop ' + (i + 1) + ' (' + wanted[i] + ') is ' + Math.round(off) + 'px off centre')
    if (i < wanted.length - 1) {
      await page.locator('.tour-card .btn.primary').click()
      await page.waitForTimeout(650)
    }
  }
})

await step('the card never runs off the screen', async () => {
  const card = await page.locator('.tour-card').boundingBox()
  const h = page.viewportSize().height
  if (card.y < 0 || card.y + card.height > h) throw new Error('the card is off screen at ' + JSON.stringify(card))
})

await step('the last stop closes it for good', async () => {
  await page.locator('.tour-card .btn.primary').click()
  await page.waitForTimeout(600)
  if (await page.locator('.tour').count()) throw new Error('the tour did not close')
  await page.reload()
  await page.waitForTimeout(1800)
  if (await page.locator('.tour').count()) throw new Error('the tour came back after a reload')
})

await step('home renders headline', async () => { await page.locator('.headline').waitFor({ timeout: 3000 }) })
await step('open wizard', async () => { await tap('আজকের হিসাব'); await page.getByText('আজ কে কে এসেছে?').waitFor({ timeout: 4000 }) })
await step('tick both men', async () => {
  await page.locator('.pick').nth(0).click()
  await page.locator('.pick').nth(1).click()
  await tap('এগিয়ে যান')
})
await step('wages screen totals', async () => {
  await page.getByText('মজুরি কত দিলেন?').waitFor({ timeout: 3000 })
  const t = await page.locator('.total .v').first().innerText()
  if (!t.includes('১,১৫০')) throw new Error('expected ₹১,১৫০ got ' + t)
  await tap('এগিয়ে যান')
})
await step('material: add a purchase', async () => {
  await page.getByText('কী মাল?').waitFor({ timeout: 3000 })
  await pickItem('সিমেন্ট')
  await page.getByText('সিমেন্ট কত বস্তা?').waitFor({ timeout: 3000 })
  for (const d of ['১', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  await page.getByText('সিমেন্ট দর কত?').waitFor({ timeout: 3000 })
  for (const d of ['৪', '১', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await page.getByText('+ দোকান যোগ করুন').click()
  await page.locator('.sheet input.input').first().fill('শর্মা ট্রেডার্স')
  await page.locator('.sheet .btn.primary').click()
  await tap('না, বাকি')
  await page.getByText('যোগ করুন', { exact: true }).last().click()
  await page.getByText('মোট').first().waitFor({ timeout: 3000 })
})
await step('material total is 4100', async () => {
  const t = await page.locator('.total .v').first().innerText()
  if (!t.includes('৪,১০০')) throw new Error('expected ৪,১০০ got ' + t)
  await tap('এগিয়ে যান')
})
await step('returned: nothing came back', async () => {
  await page.getByText('কোনো মাল ফেরত এল?').waitFor({ timeout: 3000 })
  await tap('কিছু ফেরত আসেনি')
})
await step('expenses: none today', async () => {
  await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
  await tap('আর কোনো খরচ নেই')
})
await step('progress: mark half', async () => {
  await page.getByText('কাজ কতদূর?').waitFor({ timeout: 3000 })
  await page.getByText('অর্ধেক হয়েছে').first().click()
})
await step('personal spending in the day: none', async () => {
  await page.getByText('নিজের কোনো খরচ?').waitFor({ timeout: 3000 })
  await page.getByText('না', { exact: true }).first().click()
})
await step('inventory in the day: nothing (if a shop)', async () => {
  const q = page.getByText('দোকানে মাল তুললেন?').first()
  try { await q.waitFor({ timeout: 2500 }); await page.getByText('না', { exact: true }).first().click() } catch {}
})
await step('cash: first count', async () => {
  await page.getByText('দিনের শেষে হাতে কত?').waitFor({ timeout: 3000 })
  await page.getByText('গুনে বলছি', { exact: true }).click()
  for (const d of ['৮', '০', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('ঠিক আছে')
  await tap('এগিয়ে যান')
})
await step('review shows day total 5250', async () => {
  await page.getByText('একবার দেখে নিন').waitFor({ timeout: 3000 })
  const t = await page.locator('.total .v').first().innerText()
  if (!t.includes('৫,২৫০')) throw new Error('expected ৫,২৫০ got ' + t)
})
await step('save the day', async () => {
  await page.getByText('সেভ করুন').click()
  await page.getByText('আজকের হিসাব লেখা হল').waitFor({ timeout: 5000 })
})
await step('dashboard reflects the entry', async () => {
  await page.waitForTimeout(500)
  const body = await page.locator('.scroll').first().innerText()
  if (!body.includes('রামপুর বাড়ি')) throw new Error('no project summary on home')
})
await step('same-as-yesterday appears next day', async () => {
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sitekhata')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction('entries', 'readwrite')
      const os = tx.objectStore('entries')
      const all = os.getAll()
      all.onsuccess = () => {
        const y = new Date(Date.now() - 86400000)
        const p = (n) => String(n).padStart(2, '0')
        const iso = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`
        for (const e of all.result) { e.date = iso; os.put(e) }
        tx.oncomplete = () => res(null)
      }
    }
  }))
  await page.reload()
  await page.waitForTimeout(800)
  await page.getByText('কালকের মতোই').waitFor({ timeout: 4000 })
})
await step('same-as-yesterday lands on review', async () => {
  await tap('কালকের মতোই')
  await page.getByText('একবার দেখে নিন').waitFor({ timeout: 4000 })
  const t = await page.locator('.total .v').first().innerText()
  if (!t.includes('১,১৫০')) throw new Error('expected wages-only ১,১৫০ got ' + t)
  await page.getByText('সেভ করুন').click()
  await page.waitForTimeout(600)
})
const home = async () => { await page.goto('http://localhost:5199/'); await page.waitForTimeout(700) }

await step('shop flow: goods in', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'মজুত' }).click()
  await tap('মাল এসেছে')
  await pickItem('সিমেন্ট')
  for (const d of ['২', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  for (const d of ['৪', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  await page.locator('.chip').first().click()
  await page.getByText('হ্যাঁ', { exact: true }).click()
  await tap('সেভ করুন')
  await page.waitForTimeout(600)
  const body = await page.locator('.scroll').first().innerText()
  if (!body.includes('এখন যা আছে')) throw new Error('stock list missing')
})
await step('estimator: size, floors and foundation', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'কাজ' }).click()
  await page.locator('.tile', { hasText: 'নতুন কাজের হিসাব' }).click()
  await page.locator('.chip').first().click()
  await page.getByText('এক তলার মাপ কত বর্গফুট?').waitFor({ timeout: 3000 })
  for (const d of ['১', '০', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await page.locator('.field .chips .chip').nth(1).click()        // two floors
  await page.waitForTimeout(200)
  const total = await page.locator('.small.muted').first().innerText()
  if (!total.includes('২০০০')) throw new Error('built-up should be 1000 x 2 floors, got ' + total)
  await tap('এগিয়ে যান')
})
await step('estimator: material priced from his own purchases', async () => {
  await page.getByText('মালের হিসাব').waitFor({ timeout: 3000 })
  const mat = await page.locator('.total .v').first().innerText()
  if (mat === '₹০') throw new Error('estimator priced nothing — last purchase rate did not reach it')
  await tap('এগিয়ে যান')
})
await step('estimator: labour by the day', async () => {
  await page.getByText('মজুরি কীভাবে ধরবেন?').waitFor({ timeout: 3000 })
  await page.locator('.pick').first().click()                     // by the day
  await tap('+ কাজের লোক যোগ করুন')
  await page.locator('.card input.input').first().fill('রাজমিস্ত্রি')
  await page.locator('.card input.num').nth(0).fill('4')          // four men
  await page.locator('.card input.num').nth(1).fill('600')        // at 600 a day
  await page.locator('.field input.num').last().fill('30')        // for thirty days
  await page.waitForTimeout(300)
  const labour = await page.locator('.total .v').last().innerText()
  if (!labour.includes('৭২,০০০')) throw new Error('4 men x 30 days x 600 should be 72,000 — got ' + labour)
  await tap('এগিয়ে যান')
})
await step('estimator: quote comes out whole', async () => {
  await page.getByText('অন্য খরচ').first().waitFor({ timeout: 3000 })
  await tap('এগিয়ে যান')
  await page.getByText('লাভ ও মোট').waitFor({ timeout: 3000 })
  await tap('দর তৈরি করুন')
  await page.getByText('দরপত্র').first().waitFor({ timeout: 3000 })
  const quote = await page.locator('.card').first().innerText()
  if (!quote.includes('তলা')) throw new Error('quote should name the floors')
})
await step('history lists days and can reverse', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'হিসাব' }).click()
  await page.locator('.tile', { hasText: 'পুরোনো হিসাব' }).click()
  await page.locator('.pick').first().click()
  await page.locator('.sheet .iconbtn').first().click()
  await page.getByText('বাতিল করুন').click()
  await page.waitForTimeout(500)
})
await step('personal book with pin', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'হিসাব' }).click()
  await page.locator('.tile', { hasText: 'নিজের খরচ' }).click()
  await page.getByText('খরচ লিখুন').waitFor({ timeout: 3000 })
  await tap('খরচ লিখুন')
  await page.locator('.chip').first().click()
  for (const d of ['৫', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('সেভ করুন')
  await page.waitForTimeout(500)
})
/* The whole point of the reminder: he writes a date down once, and the app
   both shows it coming and, when he pays, books the expense for him — so the
   money lands in his own book without him typing it a second time. */
await step('a date he sets for himself', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'হিসাব' }).click()
  await page.locator('.tile', { hasText: 'নিজের খরচ' }).click()
  await page.getByText('দিতে হবে').first().waitFor({ timeout: 3000 })
  await page.locator('.chip', { hasText: 'নতুন তারিখ' }).click()
  await page.locator('.sheet input.input').first().fill('ঘরভাড়া')
  await page.locator('.sheet input.input').nth(1).fill('বাড়িওয়ালা')
  await page.locator('.sheet input.input').nth(2).fill('4000')
  await page.locator('.sheet .chip', { hasText: 'আজ' }).first().click()
  await page.locator('.sheet .btn.primary').click()
  await page.waitForTimeout(600)
})

await step('it shows as due today', async () => {
  const row = page.locator('.pick', { hasText: 'ঘরভাড়া' }).first()
  await row.waitFor({ timeout: 3000 })
  const txt = await row.innerText()
  if (!/আজই/.test(txt)) throw new Error('the reminder does not say it is due today: ' + txt)
  if (!/৪,০০০/.test(txt)) throw new Error('the reminder does not carry the amount: ' + txt)
})

/* Paying it must write a real expense row — otherwise the reminder is a
   sticky note and the month's spending is wrong. */
await step('paying it books the expense on its own', async () => {
  const before = await page.locator('.review-row').count()
  await page.locator('.pick', { hasText: 'ঘরভাড়া' }).first().click()
  await tap('দিয়ে দিয়েছি')
  await page.waitForTimeout(800)
  const after = await page.locator('.review-row').count()
  if (after <= before) throw new Error('paying the reminder wrote no expense row')
  const list = await page.locator('.review-row').first().innerText()
  if (!/ঘরভাড়া/.test(list)) throw new Error('the expense is not under its own name: ' + list)
})

await step('and it stops asking', async () => {
  const still = await page.locator('.pick', { hasText: 'ঘরভাড়া' }).count()
  /* Monthly, so exactly one comes back — next month, not this one. */
  const txt = still ? await page.locator('.pick', { hasText: 'ঘরভাড়া' }).first().innerText() : ''
  if (/আজই/.test(txt)) throw new Error('the paid reminder is still asking for today')
})

const pressBack = () => page.evaluate(() => import('/src/lib/back.ts').then((m) => m.goBack()))

await step('back closes a sheet, not the screen under it', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'মজুত' }).click()          // the মজুত book → Shop
  await page.locator('.tile', { hasText: 'দোকান ও খদ্দের' }).click()     // the names page
  await page.locator('.topbar .iconbtn').last().click()                 // the + for a new name
  await page.locator('.sheet').waitFor({ timeout: 3000 })
  const claimed = await pressBack()
  if (!claimed) throw new Error('the sheet did not claim the back press')
  await page.waitForTimeout(400)
  if (await page.locator('.sheet').count()) throw new Error('the sheet is still open')
  const title = await page.locator('.topbar h1').innerText()
  if (!/দোকান ও খদ্দের/.test(title)) throw new Error('back left the page, not the sheet: ' + title)
})

await step('back leaves a settings page for settings, not for home', async () => {
  await home()
  await page.locator('.topbar .iconbtn').nth(1).click()          // gear → Settings
  await page.locator('.pick', { hasText: 'ভাষা' }).click()        // into a settings sub-page
  await page.waitForTimeout(300)
  const claimed = await pressBack()
  if (!claimed) throw new Error('the settings page did not claim the back press')
  await page.waitForTimeout(400)
  const title = await page.locator('.topbar h1').innerText()
  if (!/সেটিংস/.test(title)) throw new Error('expected to land on সেটিংস, got ' + title)
})

await step('and from settings itself nothing claims it', async () => {
  const claimed = await pressBack()
  if (claimed) throw new Error('something claimed the press that should have gone to the shell')
})

/* The list of household heads can never be complete. */
await step('personal spending takes a name of his own', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'হিসাব' }).click()
  await page.locator('.tile', { hasText: 'নিজের খরচ' }).click()
  await page.getByText('খরচ লিখুন').waitFor({ timeout: 3000 })
  await tap('খরচ লিখুন')
  await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
  await page.locator('.chip', { hasText: 'নিজে লিখুন' }).click()
  await page.locator('input.input').first().fill('সাইকেল সারানো')
  await tap('এগিয়ে যান')
  for (const d of ['২', '৫', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('সেভ করুন')
  await page.waitForTimeout(700)
})

await step('and it is written under that name', async () => {
  const body = await page.locator('.scroll').first().innerText()
  if (!/সাইকেল সারানো/.test(body)) throw new Error('his own head is not in the month: ' + body.slice(0, 200))
})

await step('which then offers itself as a chip', async () => {
  await tap('খরচ লিখুন')
  await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
  const chips = await page.locator('.chips .chip').allInnerTexts()
  if (!chips.some((c) => /সাইকেল সারানো/.test(c))) throw new Error('his own head did not come back as a chip: ' + chips.join(', '))
  await pressBack()
  await page.waitForTimeout(400)
})

await step('a credit sale becomes a receivable', async () => {
  await home()
  await page.locator('.bookhead', { hasText: 'মজুত' }).click()
  await tap('বিক্রি হয়েছে')
  await pickItem('সিমেন্ট')
  for (const d of ['৫']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  for (const d of ['৫', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  await page.getByText('কাকে বিক্রি?').waitFor({ timeout: 3000 })
  await page.locator('.chip', { hasText: '+ নতুন' }).first().click()
  await page.locator('.sheet input.input').first().fill('হালদার বাবু')
  await page.locator('.sheet .btn.primary').click()
  await tap('না, বাকি')
  await tap('সেভ করুন')
  await page.waitForTimeout(700)
  await home()
  const foot = await page.locator('.footbar').innerText()
  if (!foot.includes('২,৫০০')) throw new Error('the ₹2,500 credit sale should show as receivable: ' + foot)
})
await step('settling it clears the balance', async () => {
  await page.locator('.bookhead', { hasText: 'হিসাব' }).click()
  await page.locator('.tile', { hasText: 'টাকা দেওয়া-নেওয়া' }).click()
  await page.getByText('যাদের কাছে পাওনা').waitFor({ timeout: 3000 })
  await page.getByText('হালদার বাবু').first().click()
  await page.locator('.sheet .btn.primary').click()
  await page.waitForTimeout(700)
  await home()
  const foot = await page.locator('.footbar').innerText()
  if (foot.includes('২,৫০০')) throw new Error('the receivable should be settled: ' + foot)
})
await step('reset refuses a wrong code', async () => {
  await home()
  await page.locator('.topbar .iconbtn').nth(1).click()
  await tap('সব মুছে নতুন করে শুরু')
  await page.locator('input.input').first().fill('1234')
  await tap('মুছে ফেলুন')
  await tap('হ্যাঁ, সব মুছে দিন')
  await page.waitForTimeout(600)
  const body = await page.locator('.app').innerText()
  if (!body.includes('কোড মিলল না')) throw new Error('a wrong code must be refused')
  const rows = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sitekhata')
    r.onsuccess = () => {
      const all = r.result.transaction('entries', 'readonly').objectStore('entries').getAll()
      all.onsuccess = () => res(all.result.length)
    }
  }))
  if (!rows) throw new Error('a refused reset must not have deleted anything')
})
await step('english switch flips the whole screen', async () => {
  await home()
  await page.locator('.topbar .iconbtn').nth(1).click()
  await tap('ভাষা')
  await page.getByText('কোন ভাষায়|Language|ভাষা').first().waitFor({ timeout: 3000 }).catch(() => {})
  await page.locator('.pick').nth(1).click()
  await page.waitForTimeout(300)
  await page.locator('.topbar .iconbtn').first().click()   // back to settings
  await page.waitForTimeout(200)
  await page.locator('.topbar .iconbtn').first().click()   // back home
  await page.waitForTimeout(400)
  const body = await page.locator('.app').innerText()
  if (!body.includes("Today's entry")) throw new Error('home did not switch to English: ' + body.slice(0, 120))
  if (!/1,150|1,250|₹/.test(body)) throw new Error('numbers did not switch to ASCII')
})
await step('english is only skin deep — the ledger stays Bengali', async () => {
  const heads = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sitekhata')
    r.onsuccess = () => {
      const all = r.result.transaction('entries', 'readonly').objectStore('entries').getAll()
      all.onsuccess = () => res(all.result.map((e) => e.head_bn || e.mode || '').join(' '))
    }
  }))
  if (/[a-zA-Z]{3,}/.test(heads)) throw new Error('English words reached the stored rows: ' + heads.slice(0, 120))
})
await step('back to Bengali', async () => {
  await page.locator('.topbar .iconbtn').nth(1).click()
  await page.getByText('Language').first().click()
  await page.locator('.pick').first().click()
  await page.waitForTimeout(300)
  await page.locator('.topbar .iconbtn').first().click()
  await page.waitForTimeout(200)
  await page.locator('.topbar .iconbtn').first().click()
  await page.getByText('আজকের হিসাব').first().waitFor({ timeout: 4000 })
})
/* A man who only runs a shop has nobody on the books. Asking him who came
   today is a screen he cannot answer and cannot leave usefully. */
await step('with nobody on the books the wizard does not ask who came', async () => {
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sitekhata')
    r.onsuccess = () => {
      const db = r.result
      const tx = db.transaction('masters', 'readwrite')
      const os = tx.objectStore('masters')
      const all = os.getAll()
      all.onsuccess = () => {
        for (const m of all.result) if (m.kind === 'worker') os.delete(m.id)
        tx.oncomplete = () => res(null)
      }
    }
  }))
  await page.reload()
  await page.waitForTimeout(1200)
  await tap('আজকের হিসাব')
  await page.waitForTimeout(800)
  const body = await page.locator('.scroll').first().innerText()
  if (/আজ কে কে এসেছে/.test(body)) throw new Error('it still asked who came today')
  if (/মজুরি কত দিলেন/.test(body)) throw new Error('it still asked about wages')
})

await step('and it opens on a question he can answer', async () => {
  const q = await page.locator('.question').first().innerText()
  if (!/মাল এসেছে|আর কোনো খরচ|কাজ কতদূর|হাতে কত|কী মাল/.test(q)) {
    throw new Error('unexpected first question with no men: ' + q)
  }
})

await step('putting one man back brings the question back', async () => {
  await page.locator('.wizhead .iconbtn').last().click()   // close the wizard
  await page.waitForTimeout(500)
  await page.locator('.bookhead', { hasText: 'কাজ' }).click()          // the কাজ book
  await page.locator('.tile', { hasText: 'লোকজন' }).click()             // its men page
  await page.locator('.topbar .iconbtn').last().click()
  await page.locator('.sheet input.input').first().fill('নতুন মিস্ত্রি')
  await page.locator('.sheet input.num').first().fill('600')
  await page.locator('.sheet .btn.primary').click()
  await page.waitForTimeout(500)
  await home()
  await tap('আজকের হিসাব')
  await page.getByText('আজ কে কে এসেছে?').waitFor({ timeout: 4000 })
})

await step('and a man can be added without leaving the question', async () => {
  await page.locator('.pick', { hasText: 'নতুন লোক' }).click()
  await page.locator('.sheet').waitFor({ timeout: 3000 })
  await page.locator('.sheet input.input').first().fill('হারু')
  await page.locator('.sheet input.num').first().fill('500')
  await page.locator('.sheet .btn.primary').click()
  await page.waitForTimeout(500)
  const names = await page.locator('.pick').allInnerTexts()
  if (!names.some((n) => /হারু/.test(n))) throw new Error('the new man is not on the list: ' + names.join(' | '))
})

await step('the update page says so in a browser', async () => {
  await home()
  await page.locator('.topbar .iconbtn').nth(1).click()
  await page.locator('.pick', { hasText: 'অ্যাপ আপডেট' }).click()
  await page.getByText('এখন আছে').waitFor({ timeout: 4000 })
  await page.waitForTimeout(1200)
  const body = await page.locator('.scroll').first().innerText()
  if (!/ব্রাউজারে চলছে/.test(body)) throw new Error('it did not say updating needs the phone app: ' + body.slice(0, 200))
  if (/নতুনটা নিন/.test(body)) throw new Error('it offered a download in a browser')
})

await step('and it names where it looks', async () => {
  const body = await page.locator('.scroll').first().innerText()
  if (!/latest\.json/.test(body)) throw new Error('the manifest address is not shown')
  // The stub says 9.9.9 exists — the page must report it even though this
  // browser has no version of its own to compare it against.
  if (!/৯.৯.৯|9.9.9/.test(body)) throw new Error('it did not report the newest build: ' + body.slice(0, 240))
  if (!/হিসাব থেকে যাবে/.test(body)) throw new Error('it does not say the ledger survives an update')
  await pressBack()
  await page.waitForTimeout(400)
})

await step('backup writes a file', async () => {
  await home()
  await page.locator('.topbar .iconbtn').nth(1).click()
  await tap('ব্যাকআপ')
  await page.waitForTimeout(200)
})

console.log(log.join('\n'))
console.log('\n--- console errors ---')
console.log(errors.length ? errors.slice(0, 12).join('\n') : '(none)')
await page.screenshot({ path: 'scripts/shot-last.png' })
await browser.close()
await server.close()
process.exit(log.some((l) => l.startsWith('FAIL')) || errors.length ? 1 : 0)
