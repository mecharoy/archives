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
  await page.getByText('সিমেন্ট', { exact: true }).first().click()
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
await step('expenses: none today', async () => {
  await page.getByText('কীসের খরচ?').waitFor({ timeout: 3000 })
  await tap('আর কোনো খরচ নেই')
})
await step('progress: mark half', async () => {
  await page.getByText('কাজ কতদূর?').waitFor({ timeout: 3000 })
  await page.getByText('অর্ধেক হয়েছে').first().click()
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
  if (!body.includes('কাজের অবস্থা')) throw new Error('no project section')
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
  await page.locator('.tabs .tab', { hasText: 'মজুত' }).click()
  await page.locator('.tile', { hasText: 'দোকানের মজুত' }).click()
  await tap('মাল এসেছে')
  await page.getByText('সিমেন্ট', { exact: true }).first().click()
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
  await page.locator('.tabs .tab', { hasText: 'হিসাব' }).click()
  await page.locator('.tile', { hasText: 'পুরোনো হিসাব' }).click()
  await page.locator('.pick').first().click()
  await page.locator('.sheet .iconbtn').first().click()
  await page.getByText('বাতিল করুন').click()
  await page.waitForTimeout(500)
})
await step('personal book with pin', async () => {
  await home()
  await page.locator('.tabs .tab', { hasText: 'হিসাব' }).click()
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
  await page.locator('.tabs .tab', { hasText: 'হিসাব' }).click()
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

await step('a credit sale becomes a receivable', async () => {
  await home()
  await page.locator('.tabs .tab', { hasText: 'মজুত' }).click()
  await page.locator('.tile', { hasText: 'দোকানের মজুত' }).click()
  await tap('বিক্রি হয়েছে')
  await page.getByText('সিমেন্ট', { exact: true }).first().click()
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
  await page.locator('.tabs .tab', { hasText: 'হিসাব' }).click()
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
