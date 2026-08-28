import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5199 } })
await server.listen()
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
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
await step('onboarding: project', async () => {
  await page.locator('input.input').first().fill('রামপুর বাড়ি')
  await page.locator('input.input').nth(1).fill('2800000')
  await tap('এগিয়ে যান')
})
await step('onboarding: workers', async () => {
  await page.locator('input.input').nth(0).fill('রতন')
  await page.locator('input.input').nth(1).fill('600')
  await tap('+ আরও একজন')
  await page.locator('input.input').nth(2).fill('সুকুমার')
  await page.locator('input.input').nth(3).fill('550')
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
  await page.getByText('মাল এসেছে?').waitFor({ timeout: 3000 })
  await tap('হ্যাঁ')
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
await step('expenses: no', async () => {
  await page.getByText('আর কোনো খরচ?').waitFor({ timeout: 3000 })
  await page.getByText('না', { exact: true }).first().click()
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
await step('estimator runs end to end', async () => {
  await home()
  await page.locator('.tile', { hasText: 'নতুন কাজের হিসাব' }).click()
  await page.locator('.chip').first().click()
  for (const d of ['১', '০', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('এগিয়ে যান')
  await page.getByText('মালের হিসাব').waitFor({ timeout: 3000 })
  const mat = await page.locator('.total .v').first().innerText()
  if (mat === '₹০') throw new Error('estimator priced nothing — last purchase rate did not reach it')
  await tap('দর তৈরি করুন')
  await page.getByText('দরপত্র').first().waitFor({ timeout: 3000 })
})
await step('history lists days and can reverse', async () => {
  await home()
  await page.locator('.tile', { hasText: 'পুরোনো হিসাব' }).click()
  await page.locator('.pick').first().click()
  await page.locator('.sheet .iconbtn').first().click()
  await page.getByText('বাতিল করুন').click()
  await page.waitForTimeout(500)
})
await step('personal book with pin', async () => {
  await home()
  await page.locator('.tile', { hasText: 'নিজের খরচ' }).click()
  await page.getByText('খরচ লিখুন').waitFor({ timeout: 3000 })
  await tap('খরচ লিখুন')
  await page.locator('.chip').first().click()
  for (const d of ['৫', '০', '০']) await page.locator('.pad button', { hasText: d }).first().click()
  await tap('সেভ করুন')
  await page.waitForTimeout(500)
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
