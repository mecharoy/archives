import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ server: { port: 5196 } }); await server.listen()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await b.newPage({ viewport: { width: 400, height: 860 } })
await page.goto('http://localhost:5196/'); await page.waitForTimeout(600)
const t = async s => { await page.getByText(s).first().click(); await page.waitForTimeout(200) }
await t('শুরু করি')
await page.locator('input.input').first().fill('ক')
await t('এগিয়ে যান')
await page.locator('input.input').nth(0).fill('র')
await page.locator('input.input').nth(1).fill('600')
await t('হয়ে গেল'); await page.waitForTimeout(800)
await t('আজকের হিসাব'); await page.waitForTimeout(300)
await page.locator('.pick').nth(0).click()
await t('এগিয়ে যান'); await t('এগিয়ে যান')
await page.getByText('না', { exact: true }).first().click(); await page.waitForTimeout(200)
await page.getByText('না', { exact: true }).first().click(); await page.waitForTimeout(200)
console.log(await page.locator('.app').innerText())
await page.getByText('অর্ধেক হয়েছে').first().click(); await page.waitForTimeout(300)
await page.getByText('হ্যাঁ, এটাই আছে').click(); await page.waitForTimeout(200)
await t('সেভ করুন'); await page.waitForTimeout(900)
const rows = await page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('sitekhata')
  r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => res(q.result.filter(e=>e.kind==='progress')) }
}))
console.log('progress rows:', JSON.stringify(rows))
const stg = await page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('sitekhata')
  r.onsuccess = () => { const q = r.result.transaction('masters').objectStore('masters').getAll(); q.onsuccess = () => res(q.result.filter(e=>e.kind==='stage').map(s=>[s.seq,s.name_bn,s.weight])) }
}))
console.log('stages:', JSON.stringify(stg))
await b.close(); await server.close()
