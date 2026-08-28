import { chromium } from 'playwright'
const W = 'http://localhost:8799', A = 'dev-admin-token-for-local-testing-only'
const j = (p, o = {}) => fetch(W + p, { ...o, headers: { Authorization: 'Bearer ' + A, 'Content-Type': 'application/json', ...(o.headers||{}) } }).then(r => r.json())

const h = await j('/admin/households', { method: 'POST', body: JSON.stringify({ name: 'রামপুর (demo)' }) })
const D = h.device_token, HID = h.household.id
const post = (rows) => fetch(W + '/rows', { method: 'POST', body: JSON.stringify({ token: D, rows }) })
const d = (n) => { const x = new Date(Date.now() - n * 86400000); const p = v => String(v).padStart(2,'0'); return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}` }
let k = 0; const id = () => 'r' + (++k)

await post([
  { id: id(), tab: 'Projects', mode: 'upsert', values: ['p1','রামপুর বাড়ি','অমিত ঘোষ','ঘর',1200,2800000,d(75),120,'active','t'] },
  { id: id(), tab: 'Projects', mode: 'upsert', values: ['p2','সাহাপাড়া দেয়াল','বিকাশ দত্ত','ঘর',400,320000,d(20),40,'active','t'] },
  { id: id(), tab: 'Items', mode: 'upsert', values: ['i1','সিমেন্ট','বস্তা',410,true,'t'] },
  { id: id(), tab: 'Items', mode: 'upsert', values: ['i2','রড','কেজি',72,true,'t'] },
  { id: id(), tab: 'Items', mode: 'upsert', values: ['i3','বালি','ঘনফুট',48,true,'t'] },
  { id: id(), tab: 'Coefficients', mode: 'upsert', values: ['c1','ঘর','i1',0.4,'t'] },
  { id: id(), tab: 'Coefficients', mode: 'upsert', values: ['c2','ঘর','i2',3.5,'t'] },
  { id: id(), tab: 'Coefficients', mode: 'upsert', values: ['c3','ঘর','i3',1.2,'t'] },
  ...[['ভিত ও মাটি কাটা',8],['ফাউন্ডেশন ও কলাম',15],['প্লিন্থ ঢালাই',10],['দেওয়াল গাঁথনি',15],
      ['ছাদ ঢালাই',18],['প্লাস্টার',12],['দরজা-জানালা, লাইন',12],['রং ও ফিনিশিং',10]]
    .map(([n, w], i) => ({ id: id(), tab: 'Stages', mode: 'upsert', values: ['sg'+i,'ঘর',i+1,n,w,'t'] })),
  ...['রতন মণ্ডল','সুকুমার দাস','হারাধন বিশ্বাস','বিশু','নিতাই'].map((n,i) =>
    ({ id: id(), tab: 'Workers', mode: 'upsert', values: ['w'+i,n,[600,550,700,500,600][i],'',true,'t'] })),
])

// six weeks of days
const rows = []
for (let day = 42; day >= 0; day--) {
  const date = d(day)
  const b = 'b' + day
  for (let w = 0; w < 5; w++) {
    if ((day + w) % 7 === 3) continue
    const rate = [600,550,700,500,600][w]
    rows.push({ id: id(), tab: 'Attendance', mode: 'append', values: ['at'+day+'_'+w, b, date, 'p1', 'w'+w, 'full', 1, rate, rate, 0, '', 't'] })
  }
  if (day % 4 === 0) {
    const it = ['i1','i2','i3'][day % 3]
    const qty = [20, 260, 90][day % 3]
    const rate = [410, 72, 48][day % 3]
    rows.push({ id: id(), tab: 'Stock', mode: 'append', values: ['sk'+day, b, date, 'p1', it, 'in', qty, rate, qty*rate, 'party1', d(day-25), day % 8 === 0 ? 0 : 1, '', '', 't'] })
  }
  if (day % 5 === 0) rows.push({ id: id(), tab: 'Money', mode: 'append', values: ['mo'+day, b, date, 'p1', 'গাড়ি ভাড়া', 'paid', 1200, '', 'নগদ', '', 0, '', '', 't'] })
  rows.push({ id: id(), tab: 'Day', mode: 'append', values: ['dy'+day, b, date, 'p1', day === 0 ? 43800 : null, day === 0 ? 45250 : null, '', '', 't'] })
}
for (let i = 0; i < 5; i++) rows.push({ id: id(), tab: 'Progress', mode: 'append', values: ['pg'+i, 'bp', d(40 - i*8), 'p1', i+1, i === 4 ? 'half' : 'done', 0, '', 't'] })
rows.push({ id: id(), tab: 'Money', mode: 'append', values: ['rc1', 'bc', d(30), 'p1', 'কাজের টাকা', 'received', 1400000, '', 'ব্যাংক', '', 0, '', '', 't'] })

for (let i = 0; i < rows.length; i += 60) await post(rows.slice(i, i + 60))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1180, height: 1500 }, deviceScaleFactor: 1.6 })
await page.goto(W + '/')
await page.locator('#tok').fill(A)
await page.locator('#enter').click()
await page.waitForTimeout(1500)
await page.selectOption('#hh', HID)
await page.waitForTimeout(2500)
await page.screenshot({ path: 'scripts/shot-dashboard.png', fullPage: true })
await browser.close()
console.log('household', HID, 'device', D)
