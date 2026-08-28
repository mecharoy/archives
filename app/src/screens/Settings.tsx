import { useMemo, useState } from 'react'
import { Icon, TopBar, Pick, Chip, Sheet, Field, NumField, useToast, Toast, Empty } from '../ui/kit'
import { PinSheet } from './Personal'
import {
  useStore, saveMaster, saveSettings, activeProjects, allWorkers, allItems, parties, stages, coeffs,
  projects as allProjects, nameOf, type State,
} from '../lib/store'
import { uid } from '../lib/db'
import { money, toBn, num, isoDate, dateBn } from '../lib/bn'
import type { Project, Worker, Item, Party, Stage, Coeff } from '../lib/model'
import { flush, testEndpoint } from '../lib/sync'
import { fetchBrief } from '../lib/brief'
import { buildCsv, buildJson, saveFile, backupName } from '../lib/backup'
import { seedHouse, HOUSE } from '../lib/seed'
import { chipMissRate } from '../lib/suggest'
import { cashState } from '../lib/calc'

type Page = null | 'sync' | 'projects' | 'workers' | 'items' | 'parties' | 'stages' | 'cash' | 'backup' | 'display'

export function Settings({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [page, setPage] = useState<Page>(null)
  const [pin, setPin] = useState(false)
  const toast = useToast()

  if (page === 'sync') return <SyncPage s={s} onBack={() => setPage(null)} />
  if (page === 'projects') return <ProjectsPage s={s} onBack={() => setPage(null)} />
  if (page === 'workers') return <WorkersPage s={s} onBack={() => setPage(null)} />
  if (page === 'items') return <ItemsPage s={s} onBack={() => setPage(null)} />
  if (page === 'parties') return <PartiesPage s={s} onBack={() => setPage(null)} />
  if (page === 'stages') return <StagesPage s={s} onBack={() => setPage(null)} />
  if (page === 'cash') return <CashPage s={s} onBack={() => setPage(null)} />
  if (page === 'backup') return <BackupPage onBack={() => setPage(null)} />
  if (page === 'display') return <DisplayPage s={s} onBack={() => setPage(null)} />

  const miss = chipMissRate({ taken: s.settings.chips_taken, expanded: s.settings.chips_expanded })

  return (
    <>
      <TopBar title="সেটিংস" onBack={onBack} />
      <div className="scroll">
        <p className="sectionlabel">হিসাবের জিনিসপত্র</p>
        <div className="rowlist">
          <Pick title="কাজ" sub={`${toBn(activeProjects(s).length)}টা চলছে`} right={<Icon name="fwd" size={18} />} onClick={() => setPage('projects')} />
          <Pick title="লোকজন" sub={`${toBn(allWorkers(s).filter((w) => w.active).length)} জন`} right={<Icon name="fwd" size={18} />} onClick={() => setPage('workers')} />
          <Pick title="মাল" sub={`${toBn(allItems(s).length)} রকম`} right={<Icon name="fwd" size={18} />} onClick={() => setPage('items')} />
          <Pick title="দোকান ও খদ্দের" sub={`${toBn(parties(s).length)} জন`} right={<Icon name="fwd" size={18} />} onClick={() => setPage('parties')} />
          <Pick title="কাজের ধাপ ও থাম্ব রুল" sub={`${toBn(stages(s).length)}টা ধাপ`} right={<Icon name="fwd" size={18} />} onClick={() => setPage('stages')} />
        </div>

        <p className="sectionlabel">টাকা ও খাতা</p>
        <div className="rowlist">
          <Pick title="হাতের টাকা" sub={money(cashState(s.entries, s.settings.opening_cash, s.settings.opening_date).computed)}
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('cash')} />
          <Pick title="Google Sheet ও রাতের হিসাব" sub={s.settings.endpoint ? 'জোড়া লাগানো আছে' : 'এখনও জোড়া লাগানো হয়নি'}
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('sync')} />
          <Pick title="ব্যাকআপ" sub="ফোনে একটা কপি রেখে দিন" right={<Icon name="fwd" size={18} />} onClick={() => setPage('backup')} />
          <Pick title="নিজের খরচের পাসকোড" sub={s.settings.pin_hash ? 'দেওয়া আছে' : 'দেওয়া নেই'} right={<Icon name="lock" size={18} />} onClick={() => setPin(true)} />
        </div>

        <p className="sectionlabel">দেখা ও পড়া</p>
        <div className="rowlist">
          <Pick title="লেখার আকার ও রং" sub={s.settings.theme === 'system' ? 'ফোনের মতো' : s.settings.theme === 'dark' ? 'অন্ধকার' : 'আলো'}
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('display')} />
        </div>

        {miss != null && (
          <>
            <p className="sectionlabel">নিজের জন্য</p>
            <div className="card">
              <div className="spread"><span>বাছাই ঠিক হচ্ছে?</span>
                <strong className="num">{toBn(Math.round((1 - miss) * 100))}%</strong></div>
              <p className="small muted" style={{ marginTop: '.4rem' }}>
                {miss > 0.34
                  ? 'তিন ভাগের এক ভাগের বেশি সময় পুরো তালিকা খুলতে হচ্ছে — বাছাইয়ের নিয়মটা ঠিক করা দরকার।'
                  : 'বেশির ভাগ সময় প্রথম তিনটে চিপেই কাজ হয়ে যাচ্ছে।'}
              </p>
            </div>
          </>
        )}

        <p className="small muted" style={{ marginTop: '1.6rem' }}>Site Khata · {toBn('1.0')} · হিসাব আগে ফোনে লেখা হয়, তারপর খাতায় ওঠে।</p>
      </div>
      {pin && <PinSheet onClose={() => setPin(false)} onSaved={() => { setPin(false); toast.show('পাসকোড সেভ হয়েছে') }} />}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* ---------- sync ---------- */

function SyncPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [endpoint, setEndpoint] = useState(s.settings.endpoint)
  const [token, setToken] = useState(s.settings.token)
  const [briefUrl, setBriefUrl] = useState(s.settings.briefUrl)
  const [briefToken, setBriefToken] = useState(s.settings.briefToken)
  const [busy, setBusy] = useState('')
  const toast = useToast()

  const save = async () => {
    await saveSettings({ endpoint: endpoint.trim(), token: token.trim(), briefUrl: briefUrl.trim(), briefToken: briefToken.trim() })
    toast.show('সেভ হয়েছে')
  }

  return (
    <>
      <TopBar title="Sheet ও রাতের হিসাব" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          অ্যাপ প্রথমে ফোনে লেখে, তারপর নেট পেলে Google Sheet-এ পাঠায়। ঠিকানা না দিলেও অ্যাপ পুরোপুরি চলে — শুধু খাতাটা ফোনেই থাকে।
        </p>
        <Field label="Sheet-এ লেখার ঠিকানা (Apps Script web app URL)">
          <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://script.google.com/…/exec" inputMode="url" autoCapitalize="off" />
        </Field>
        <Field label="গোপন টোকেন">
          <input className="input" value={token} onChange={(e) => setToken(e.target.value)} autoCapitalize="off" />
        </Field>
        <div className="actionbar" style={{ borderTop: 0, padding: '.2rem 0 1rem' }}>
          <button className="btn ghost" disabled={!!busy} onClick={async () => {
            setBusy('test')
            const err = await testEndpoint(endpoint.trim(), token.trim())
            setBusy('')
            toast.show(err || 'যোগাযোগ ঠিক আছে')
          }}>{busy === 'test' ? 'দেখছি…' : 'পরীক্ষা করুন'}</button>
          <button className="btn primary" onClick={save}>সেভ করুন</button>
        </div>

        <div className="divider" />
        <Field label="রাতের হিসাবের ফাইল (brief.json)">
          <input className="input" value={briefUrl} onChange={(e) => setBriefUrl(e.target.value)} placeholder="https://…/brief.json" inputMode="url" autoCapitalize="off" />
        </Field>
        <Field label="ফাইলের টোকেন (থাকলে)">
          <input className="input" value={briefToken} onChange={(e) => setBriefToken(e.target.value)} autoCapitalize="off" />
        </Field>
        <div className="actionbar" style={{ borderTop: 0, padding: '.2rem 0 1rem' }}>
          <button className="btn ghost" disabled={!!busy} onClick={async () => {
            await saveSettings({ briefUrl: briefUrl.trim(), briefToken: briefToken.trim() })
            setBusy('brief')
            const err = await fetchBrief(false)
            setBusy('')
            toast.show(err || 'রাতের হিসাব এসে গেছে')
          }}>{busy === 'brief' ? 'আনছি…' : 'এখন আনুন'}</button>
          <button className="btn primary" onClick={save}>সেভ করুন</button>
        </div>

        <div className="divider" />
        <div className="card">
          <div className="spread">
            <span>পাঠানো বাকি</span>
            <strong className="num">{toBn(s.outbox.length)} লাইন</strong>
          </div>
          {s.sync_error && <p className="small" style={{ color: 'var(--crit)', marginTop: '.4rem' }}>{s.sync_error}</p>}
          <button className="btn quiet small" style={{ marginTop: '.7rem' }} disabled={!s.outbox.length}
            onClick={async () => { const r = await flush(true); toast.show(r.error || `${toBn(r.sent)} লাইন পাঠানো হল`) }}>
            এখনই পাঠান
          </button>
        </div>
        <p className="small muted" style={{ marginTop: '.8rem' }}>
          Google-এর চাবি কখনও ফোনে রাখা হয় না — অ্যাপ শুধু আপনার নিজের Apps Script ঠিকানায় লাইনগুলো পাঠায়, চাবি থাকে Google-এর ভিতরেই।
        </p>
      </div>
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* ---------- masters ---------- */

function ProjectsPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Project | null>(null)
  const list = allProjects(s)
  const blank = (): Project => ({
    id: uid(), kind: 'project', name_bn: '', client_bn: '', ptype: HOUSE, area_sqft: null,
    budget: null, start_date: isoDate(), plan_days: null, status: 'active', updated_at: '',
  })
  return (
    <>
      <TopBar title="কাজ" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>একটা কাজ যোগ করুন — তারপর রোজকার হিসাব শুরু।</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((p) => (
            <Pick key={p.id} title={p.name_bn} sub={`${p.client_bn || 'খদ্দের লেখা নেই'} · ${p.status === 'active' ? 'চলছে' : 'শেষ'}`}
              right={<span className="num small">{p.budget ? money(p.budget) : ''}</span>} onClick={() => setEdit(p)} />
          ))}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন কাজ'} onClose={() => setEdit(null)}>
          <Field label="কাজের নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} placeholder="যেমন — রামপুর বাড়ি" /></Field>
          <Field label="খদ্দের"><input className="input" value={edit.client_bn} onChange={(e) => setEdit({ ...edit, client_bn: e.target.value })} /></Field>
          <Field label="ধরন">
            <div className="chips">
              {[...new Set([HOUSE, ...stages(s).map((x) => x.project_type)])].map((t) => (
                <Chip key={t} on={edit.ptype === t} onClick={() => setEdit({ ...edit, ptype: t })}>{t}</Chip>
              ))}
            </div>
          </Field>
          <Field label="মাপ (বর্গফুট)"><NumField value={edit.area_sqft} onChange={(v) => setEdit({ ...edit, area_sqft: v })} /></Field>
          <Field label="চুক্তির টাকা"><NumField value={edit.budget} onChange={(v) => setEdit({ ...edit, budget: v })} /></Field>
          <Field label="কত দিনে শেষ করার কথা"><NumField value={edit.plan_days} onChange={(v) => setEdit({ ...edit, plan_days: v })} /></Field>
          <Field label="অবস্থা">
            <div className="chips">
              <Chip on={edit.status === 'active'} onClick={() => setEdit({ ...edit, status: 'active' })}>চলছে</Chip>
              <Chip on={edit.status === 'done'} onClick={() => setEdit({ ...edit, status: 'done' })}>শেষ</Chip>
            </div>
          </Field>
          <button className="btn primary" disabled={!edit.name_bn.trim()} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>সেভ করুন</button>
        </Sheet>
      )}
    </>
  )
}

function WorkersPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Worker | null>(null)
  const list = allWorkers(s)
  const blank = (): Worker => ({ id: uid(), kind: 'worker', name_bn: '', rate: 0, phone: '', active: true, updated_at: '' })
  return (
    <>
      <TopBar title="লোকজন" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>যাদের রোজ মজুরি দেন তাদের একবার বসিয়ে নিন।</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((w) => (
            <Pick key={w.id} title={w.name_bn} sub={w.active ? undefined : 'এখন কাজ করছে না'}
              right={<span className="num">{money(w.rate)}</span>} onClick={() => setEdit(w)} />
          ))}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন লোক'} onClose={() => setEdit(null)}>
          <Field label="নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} autoFocus /></Field>
          <Field label="রোজ কত"><NumField value={edit.rate} onChange={(v) => setEdit({ ...edit, rate: v ?? 0 })} /></Field>
          <Field label="ফোন"><input className="input" value={edit.phone} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="অবস্থা">
            <div className="chips">
              <Chip on={edit.active} onClick={() => setEdit({ ...edit, active: true })}>কাজ করছে</Chip>
              <Chip on={!edit.active} onClick={() => setEdit({ ...edit, active: false })}>এখন নেই</Chip>
            </div>
          </Field>
          <button className="btn primary" disabled={!edit.name_bn.trim() || !edit.rate} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>সেভ করুন</button>
        </Sheet>
      )}
    </>
  )
}

function ItemsPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Item | null>(null)
  const list = allItems(s)
  const units = ['বস্তা', 'কেজি', 'পিস', 'ঘনফুট', 'ট্রাক', 'লিটার', 'ফুট']
  const blank = (): Item => ({ id: uid(), kind: 'item', name_bn: '', unit_bn: 'পিস', last_rate: null, active: true, updated_at: '' })
  return (
    <>
      <TopBar title="মাল" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>মাল কেনার সময় নতুন নাম যোগ করা যায় — আগে থেকে বসাতেই হবে এমন নয়।</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((i) => (
            <Pick key={i.id} title={i.name_bn} sub={i.unit_bn}
              right={<span className="num small">{i.last_rate ? money(i.last_rate) : ''}</span>} onClick={() => setEdit(i)} />
          ))}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন মাল'} onClose={() => setEdit(null)}>
          <Field label="নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} autoFocus /></Field>
          <Field label="কীসের হিসাবে">
            <div className="chips">{units.map((u) => <Chip key={u} on={edit.unit_bn === u} onClick={() => setEdit({ ...edit, unit_bn: u })}>{u}</Chip>)}</div>
          </Field>
          <Field label="শেষ দর"><NumField value={edit.last_rate} onChange={(v) => setEdit({ ...edit, last_rate: v })} decimal /></Field>
          <button className="btn primary" disabled={!edit.name_bn.trim()} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>সেভ করুন</button>
        </Sheet>
      )}
    </>
  )
}

function PartiesPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Party | null>(null)
  const list = parties(s)
  const blank = (): Party => ({ id: uid(), kind: 'party', name_bn: '', ptype: 'supplier', terms_days: 0, phone: '', updated_at: '' })
  return (
    <>
      <TopBar title="দোকান ও খদ্দের" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>মাল কেনার সময় দোকানের নাম যোগ করা যায়।</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((p) => (
            <Pick key={p.id} title={p.name_bn} sub={p.ptype === 'supplier' ? `${toBn(p.terms_days)} দিনের বাকি` : 'খদ্দের'} onClick={() => setEdit(p)} />
          ))}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন'} onClose={() => setEdit(null)}>
          <Field label="নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} autoFocus /></Field>
          <Field label="কী">
            <div className="chips">
              <Chip on={edit.ptype === 'supplier'} onClick={() => setEdit({ ...edit, ptype: 'supplier' })}>দোকান</Chip>
              <Chip on={edit.ptype === 'client'} onClick={() => setEdit({ ...edit, ptype: 'client' })}>খদ্দের</Chip>
            </div>
          </Field>
          {edit.ptype === 'supplier' && (
            <Field label="কত দিনের বাকিতে দেয়"><NumField value={edit.terms_days} onChange={(v) => setEdit({ ...edit, terms_days: v ?? 0 })} /></Field>
          )}
          <Field label="ফোন"><input className="input" value={edit.phone} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <button className="btn primary" disabled={!edit.name_bn.trim()} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>সেভ করুন</button>
        </Sheet>
      )}
    </>
  )
}

function StagesPage({ s, onBack }: { s: State; onBack: () => void }) {
  const list = stages(s)
  const cf = coeffs(s)
  const [edit, setEdit] = useState<Stage | null>(null)
  const [editC, setEditC] = useState<Coeff | null>(null)
  const toast = useToast()
  const types = useMemo(() => [...new Set(list.map((x) => x.project_type))], [list])
  const weight = list.reduce((a, x) => a + x.weight, 0)

  return (
    <>
      <TopBar title="ধাপ ও থাম্ব রুল" onBack={onBack} />
      <div className="scroll">
        {list.length === 0 && (
          <>
            <Empty>কাজের ধাপ বসানো না থাকলে অগ্রগতি হিসাব হয় না।</Empty>
            <button className="btn quiet" style={{ width: '100%' }}
              onClick={async () => { await seedHouse(allItems(s)); toast.show('ঘর তৈরির চেনা ধাপ বসানো হল — নিজের মতো বদলে নিন') }}>
              ঘর তৈরির চেনা ধাপ বসিয়ে দিন
            </button>
          </>
        )}

        {types.map((t) => (
          <div key={t}>
            <p className="sectionlabel">{t} — ধাপ {weight !== 100 && <span style={{ color: 'var(--warn)' }}>(ওজনের যোগফল {toBn(weight)}, ১০০ হওয়া দরকার)</span>}</p>
            <div className="card">
              {list.filter((x) => x.project_type === t).map((st) => (
                <button className="review-row" key={st.id} onClick={() => setEdit(st)}>
                  <span><span className="t">{toBn(st.seq)}. {st.name_bn}</span></span>
                  <span className="v num">{toBn(st.weight)}</span>
                  <Icon name="fwd" size={16} />
                </button>
              ))}
            </div>
            <p className="sectionlabel">{t} — প্রতি বর্গফুটে</p>
            <div className="card">
              {cf.filter((x) => x.project_type === t).map((c) => (
                <button className="review-row" key={c.id} onClick={() => setEditC(c)}>
                  <span><span className="t">{nameOf(s, c.item_id)}</span></span>
                  <span className="v num">{num(c.per_sqft, 2)}</span>
                  <Icon name="fwd" size={16} />
                </button>
              ))}
              {cf.filter((x) => x.project_type === t).length === 0 && <p className="hint">কিছু বসানো নেই।</p>}
            </div>
          </div>
        ))}

        <p className="small muted" style={{ marginTop: '1.2rem' }}>
          ধাপের ওজন মিলে ১০০ হলে ‘কাজ কতদূর’ থেকে শতকরা নিজে থেকেই বেরোয়। থাম্ব রুল দিয়ে নতুন কাজের হিসাব হয় — কাজ শেষে আসল খরচ দেখে এগুলো ঠিক করে নেবেন।
        </p>
      </div>
      {edit && (
        <Sheet title={edit.name_bn} onClose={() => setEdit(null)}>
          <Field label="ধাপের নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} /></Field>
          <Field label="ওজন (সব মিলিয়ে ১০০)"><NumField value={edit.weight} onChange={(v) => setEdit({ ...edit, weight: v ?? 0 })} decimal /></Field>
          <button className="btn primary" style={{ marginTop: '.5rem' }} onClick={async () => { await saveMaster(edit); setEdit(null) }}>সেভ করুন</button>
        </Sheet>
      )}
      {editC && (
        <Sheet title={nameOf(s, editC.item_id)} onClose={() => setEditC(null)}>
          <Field label="প্রতি বর্গফুটে কত"><NumField value={editC.per_sqft} onChange={(v) => setEditC({ ...editC, per_sqft: v ?? 0 })} decimal /></Field>
          <button className="btn primary" style={{ marginTop: '.5rem' }} onClick={async () => { await saveMaster(editC); setEditC(null) }}>সেভ করুন</button>
        </Sheet>
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function CashPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [amount, setAmount] = useState<number | null>(s.settings.opening_cash)
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const toast = useToast()
  return (
    <>
      <TopBar title="হাতের টাকা" onBack={onBack} />
      <div className="scroll">
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="spread"><span>এখন হিসাবমতো</span><strong className="num" style={{ fontSize: '1.3rem' }}>{money(cash.computed)}</strong></div>
          <p className="small muted" style={{ marginTop: '.4rem' }}>
            শেষ গোনা {dateBn(cash.anchor_date, false)} — {money(cash.anchor_amount)}। তারপর ঢুকেছে {money(cash.in_since)}, বেরিয়েছে {money(cash.out_since)}।
          </p>
        </div>
        <p className="hint" style={{ marginTop: '1rem' }}>
          রোজকার হিসাবের শেষে টাকা গুনলে এই সংখ্যাটা নিজে থেকেই ঠিক হয়ে যায়। প্রথম দিনের জন্য শুধু একবার শুরুর টাকাটা বসিয়ে দিন।
        </p>
        <Field label="শুরুর টাকা"><NumField value={amount} onChange={setAmount} /></Field>
        <button className="btn primary" onClick={async () => {
          await saveSettings({ opening_cash: amount ?? 0, opening_date: isoDate() })
          toast.show('সেভ হয়েছে')
        }}>সেভ করুন</button>
      </div>
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function BackupPage({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState('')
  const toast = useToast()
  const run = async (kind: 'csv' | 'json') => {
    setBusy(kind)
    const text = kind === 'csv' ? await buildCsv() : await buildJson()
    const r = await saveFile(backupName(kind), text, kind === 'csv' ? 'text/csv' : 'application/json')
    setBusy('')
    toast.show(r.ok ? `রাখা হল — ${r.where}` : 'রাখা গেল না')
  }
  return (
    <>
      <TopBar title="ব্যাকআপ" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          পুরো খাতাটা একটা ফাইলে বেরিয়ে আসে, ফোনের Documents ফোল্ডারে। মাসে একবার করে রাখলে ফোন হারালেও হিসাব থাকে।
        </p>
        <div className="rowlist">
          <Pick title="স্প্রেডশিটের জন্য (CSV)" sub="Excel বা Google Sheet-এ খোলে" onClick={() => run('csv')} right={busy === 'csv' ? <span className="small">…</span> : <Icon name="fwd" size={18} />} />
          <Pick title="পুরো কপি (JSON)" sub="সব কিছু, হুবহু" onClick={() => run('json')} right={busy === 'json' ? <span className="small">…</span> : <Icon name="fwd" size={18} />} />
        </div>
      </div>
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

function DisplayPage({ s, onBack }: { s: State; onBack: () => void }) {
  return (
    <>
      <TopBar title="লেখার আকার ও রং" onBack={onBack} />
      <div className="scroll">
        <p className="sectionlabel">লেখার আকার</p>
        <div className="chips">
          {[
            ['ছোট', 0.92], ['সাধারণ', 1], ['বড়', 1.12], ['আরও বড়', 1.26],
          ].map(([label, v]) => (
            <Chip key={String(label)} on={Math.abs(s.settings.text_scale - (v as number)) < 0.01}
              onClick={() => void saveSettings({ text_scale: v as number })}>{label as string}</Chip>
          ))}
        </div>
        <p className="sectionlabel">রং</p>
        <div className="chips">
          {[['ফোনের মতো', 'system'], ['আলো', 'light'], ['অন্ধকার', 'dark']].map(([label, v]) => (
            <Chip key={v} on={s.settings.theme === v} onClick={() => void saveSettings({ theme: v as 'system' | 'light' | 'dark' })}>{label}</Chip>
          ))}
        </div>
        <div className="card" style={{ marginTop: '1.4rem' }}>
          <p className="small muted">নমুনা</p>
          <div className="spread" style={{ marginTop: '.4rem' }}><span>আজকের মজুরি</span><strong className="num" style={{ fontSize: '1.3rem' }}>{money(4820)}</strong></div>
        </div>
      </div>
    </>
  )
}

