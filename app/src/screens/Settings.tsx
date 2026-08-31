import { useEffect, useMemo, useState } from 'react'
import { Icon, TopBar, Pick, Chip, Sheet, Field, NumField, PhoneField, useToast, Toast, Empty } from '../ui/kit'
import { PinSheet } from './Personal'
import { NewItemSheet } from './DayWizard'
import {
  useStore, saveMaster, saveSettings, allWorkers, allItems, parties, stages, coeffs,
  projects as allProjects, nameOf, type State,
} from '../lib/store'
import { uid } from '../lib/db'
import { money, toBn, num, isoDate, dateBn, agoBn } from '../lib/bn'
import type { Project, Worker, Item, Party, Stage, Coeff, Bill } from '../lib/model'
import { flush, testEndpoint } from '../lib/sync'
import { fetchBrief } from '../lib/brief'
import { buildCsv, buildJson, saveFile, backupName } from '../lib/backup'
import { restoreFromServer } from '../lib/restore'
import { seedHouse, HOUSE } from '../lib/seed'
import { chipMissRate } from '../lib/suggest'
import { readContacts, pickOneContact, type PhoneContact } from '../lib/contacts'
import { plan, reschedule, type RemindWhen } from '../lib/remind'
import { factoryReset } from '../lib/reset'
import { cashState } from '../lib/calc'
import { t, tf, pick } from '../lib/i18n'
import { useBackHandler } from '../lib/back'
import {
  installed, fetchRelease, canInstall,
  nativePlatform, openLatestDownload, sizeText, DEFAULT_MANIFEST, type Installed, type Release,
} from '../lib/update'

type Page = null | 'sync' | 'projects' | 'workers' | 'items' | 'parties' | 'stages' | 'cash' | 'backup' | 'display' | 'lang' | 'remind' | 'reset' | 'update'

export function Settings({ onBack }: { onBack: () => void }) {
  const s = useStore((x) => x)
  const [page, setPage] = useState<Page>(null)
  const [pin, setPin] = useState(false)
  const toast = useToast()
  // The real installed version, read from the phone itself — the footer used
  // to print a hard-coded "1.0", which told him nothing about what he had.
  const [ver, setVer] = useState('')
  useEffect(() => { void installed().then((i) => { if (i?.name) setVer(i.name) }) }, [])
  // Back out of লোকজন and you land on সেটিংস, not on the home screen.
  useBackHandler(() => setPage(null), page !== null)

  if (page === 'sync') return <SyncPage s={s} onBack={() => setPage(null)} />
  if (page === 'projects') return <ProjectsPage s={s} onBack={() => setPage(null)} />
  if (page === 'workers') return <WorkersPage s={s} onBack={() => setPage(null)} />
  if (page === 'items') return <ItemsPage s={s} onBack={() => setPage(null)} />
  if (page === 'parties') return <PartiesPage s={s} onBack={() => setPage(null)} />
  if (page === 'stages') return <StagesPage s={s} onBack={() => setPage(null)} />
  if (page === 'cash') return <CashPage s={s} onBack={() => setPage(null)} />
  if (page === 'backup') return <BackupPage onBack={() => setPage(null)} />
  if (page === 'display') return <DisplayPage s={s} onBack={() => setPage(null)} />
  if (page === 'lang') return <LangPage s={s} onBack={() => setPage(null)} />
  if (page === 'remind') return <RemindPage s={s} onBack={() => setPage(null)} />
  if (page === 'reset') return <ResetPage onBack={() => setPage(null)} />
  if (page === 'update') return <UpdatePage s={s} onBack={() => setPage(null)} />

  const miss = chipMissRate({ taken: s.settings.chips_taken, expanded: s.settings.chips_expanded })

  return (
    <>
      <TopBar title="সেটিংস" onBack={onBack} />
      <div className="scroll">
        {/* The lists he edits — সাইট, লোক, মাল, দোকান, ধাপ — used to live here.
            They now sit inside the book each belongs to (কাজ, মজুত) and in
            ‘সব কিছু’, so a thing is changed where it is added, not in a separate
            settings drawer. What remains here is the app itself: how it looks,
            how it talks to the server, backups and the passcode. */}
        <p className="sectionlabel">{t("টাকা ও খাতা")}</p>
        <div className="rowlist">
          <Pick title="অনলাইন খাতা" sub={s.settings.endpoint ? t('জোড়া লাগানো আছে') : t('শুধু ফোনে রাখা হচ্ছে')}
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('sync')} />
          <Pick title="ব্যাকআপ" sub="ফোনে একটা কপি রেখে দিন" right={<Icon name="fwd" size={18} />} onClick={() => setPage('backup')} />
          <Pick title="টাকার তাগাদা" sub={REMIND_LABEL[s.settings.remind]} right={<Icon name="fwd" size={18} />} onClick={() => setPage('remind')} />
          <Pick title="নিজের খরচের পাসকোড" sub={s.settings.pin_hash ? t('দেওয়া আছে') : t('দেওয়া নেই')} right={<Icon name="lock" size={18} />} onClick={() => setPin(true)} />
        </div>

        <p className="sectionlabel">{t("দেখা ও পড়া")}</p>
        <div className="rowlist">
          <Pick title="ভাষা" sub={s.settings.lang === 'en' ? 'English' : 'বাংলা'}
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('lang')} />
          <Pick title="লেখার আকার ও রং" sub={s.settings.theme === 'system' ? t('ফোনের মতো') : s.settings.theme === 'dark' ? t('অন্ধকার') : t('আলো')}
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('display')} />
          {/* Clearing the flag is all it takes — the app shell watches it and
              takes him home, where every stop on the walk round lives. */}
          <Pick title="অ্যাপটা ঘুরে দেখুন" sub="প্রথম দিনের মতো আবার দেখিয়ে দেবে"
            right={<Icon name="fwd" size={18} />}
            onClick={async () => { await saveSettings({ toured: false }); onBack() }} />
          <Pick title="অ্যাপ আপডেট" sub="নতুন সংস্করণ এসেছে কিনা দেখুন"
            right={<Icon name="fwd" size={18} />} onClick={() => setPage('update')} />
        </div>

        {miss != null && (
          <>
            <p className="sectionlabel">{t("নিজের জন্য")}</p>
            <div className="card">
              <div className="spread"><span>{t("বাছাই ঠিক হচ্ছে?")}</span>
                <strong className="num">{toBn(Math.round((1 - miss) * 100))}%</strong></div>
              <p className="small muted" style={{ marginTop: '.4rem' }}>
                {miss > 0.34
                  ? t('তিন ভাগের এক ভাগের বেশি সময় পুরো তালিকা খুলতে হচ্ছে — বাছাইয়ের নিয়মটা ঠিক করা দরকার।')
                  : t('বেশির ভাগ সময় প্রথম তিনটে চিপেই কাজ হয়ে যাচ্ছে।')}
              </p>
            </div>
          </>
        )}

        <p className="sectionlabel">{t('বিপজ্জনক')}</p>
        <div className="rowlist">
          <Pick title="সব মুছে নতুন করে শুরু" sub="ফোন আর অনলাইন খাতা — দুটোই খালি হয়ে যাবে"
            right={<Icon name="trash" size={18} />} onClick={() => setPage('reset')} />
        </div>

        <p className="small muted" style={{ marginTop: '1.6rem' }}>{tf('Site Khata · {0} · হিসাব আগে ফোনে লেখা হয়, তারপর খাতায় ওঠে।', ver ? toBn(ver) : '—')}</p>
      </div>
      {pin && <PinSheet onClose={() => setPin(false)} onSaved={() => { setPin(false); toast.show('পাসকোড সেভ হয়েছে') }} />}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* ---------- keeping the app current ---------- */

/* The home screen only speaks up when there is genuinely something newer.
   This page is where he can ask on purpose and always get an answer —
   including "you already have the newest one", which is the answer he wants
   most of the time and the one an alert can never give him. */
function UpdatePage({ s, onBack }: { s: State; onBack: () => void }) {
  const [here, setHere] = useState<Installed | null>(null)
  const [there, setThere] = useState<Release | null>(null)
  const [looking, setLooking] = useState(true)
  const [allowed, setAllowed] = useState(true)
  const [native, setNative] = useState(false)

  const look = async () => {
    setLooking(true)
    // Every probe is individually capped, so no single call — not even a
    // native bridge or a dynamic import that never answers on a given phone —
    // can hold the check open. The spinner always ends within ~10 seconds.
    const cap = <T,>(p: Promise<T>, fb: T): Promise<T> =>
      Promise.race([p.catch(() => fb), new Promise<T>((r) => setTimeout(() => r(fb), 10000))])
    try {
      const [n, a, b, c] = await Promise.all([
        cap(nativePlatform(), true), cap(installed(), null), cap(fetchRelease(), null), cap(canInstall(), false),
      ])
      setNative(n); setHere(a); setThere(b); setAllowed(c)
      await saveSettings({ update_checked_at: new Date().toISOString() })
    } finally {
      setLooking(false)
    }
  }
  useEffect(() => { void look() }, []) // eslint-disable-line

  /* Offer the latest whenever the server has one and it is not older than
     what we can see. Crucially this does NOT require reading the installed
     version: if that native call fails (here === null) on a real phone, the
     manual update must still work — reinstalling the same build is harmless,
     and being unable to read a version must never trap him on an old one. */
  const offer = native && !!there && (!here || there.code > here.code)
  const phone = native

  return (
    <>
      <TopBar title="অ্যাপ আপডেট" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t('নতুন সংস্করণ এলে অ্যাপ নিজেই জানিয়ে দেবে। এখান থেকে যখন খুশি নিজে দেখে নেওয়া যায়।')}
        </p>

        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="spread">
            <span>{t('এখন আছে')}</span>
            <strong className="num">{here ? here.name : phone ? t('জানা যায়নি') : '—'}</strong>
          </div>
          <div className="spread" style={{ marginTop: '.5rem' }}>
            <span>{t('সবচেয়ে নতুন')}</span>
            <strong className="num">{looking ? t('দেখছি…') : there ? there.name : '—'}</strong>
          </div>
        </div>

        {!looking && !phone && (
          <p className="hint" style={{ marginTop: '.9rem' }}>
            {t('এটা ব্রাউজারে চলছে — আপডেট শুধু ফোনের অ্যাপে কাজ করে।')}
          </p>
        )}
        {!looking && phone && !there && (
          <p className="hint" style={{ marginTop: '.9rem' }}>
            {t('খবর আনা গেল না। নেট এলে আবার দেখুন।')}
          </p>
        )}
        {!looking && phone && there && !offer && (
          <p className="hint" style={{ marginTop: '.9rem' }}>{t('আপনার কাছে সবচেয়ে নতুনটাই আছে।')}</p>
        )}

        {offer && (
          <>
            {there!.notes_bn && (
              <>
                <p className="sectionlabel">{t('নতুন কী আছে')}</p>
                <div className="card">{pick(there!.notes_bn, there!.notes_en)}</div>
              </>
            )}
            {!allowed && (
              <div className="alert warn" style={{ marginTop: '.9rem' }}>
                <span className="dot" />
                <span>{t('এই অ্যাপকে নতুন সংস্করণ বসানোর অনুমতি দেওয়া নেই। একবার অনুমতি দিলে পরের বার থেকে আর লাগবে না।')}</span>
              </div>
            )}
            <p className="hint" style={{ marginTop: '.9rem' }}>
              {t('“নতুনটা নিন” চাপলে ফোনের ব্রাউজারে নতুন ফাইলটা নামবে, তারপর Install চাপুন।')}
            </p>
            <button className="btn primary" style={{ width: '100%', marginTop: '1rem' }}
              onClick={() => openLatestDownload(there!.url)}>
              {t('নতুনটা নিন')}{there!.size ? ' · ' + sizeText(there!.size) : ''}
            </button>
          </>
        )}

        <button className="btn quiet" style={{ width: '100%', marginTop: '.7rem' }}
          disabled={looking} onClick={() => void look()}>{t('আবার দেখুন')}</button>

        <p className="sectionlabel">{t('কোথা থেকে')}</p>
        <p className="small muted" style={{ wordBreak: 'break-all' }}>
          {s.settings.update_url || DEFAULT_MANIFEST}
        </p>
        <p className="small muted" style={{ marginTop: '.6rem' }}>
          {t('নতুন সংস্করণ বসালেও আপনার লেখা হিসাব থেকে যাবে — কিছু মুছবে না।')}
        </p>
      </div>
    </>
  )
}

/* ---------- sync ---------- */

function SyncPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [endpoint, setEndpoint] = useState(s.settings.endpoint)
  const [token, setToken] = useState(s.settings.token)
  const [busy, setBusy] = useState('')
  const [confirmRestore, setConfirmRestore] = useState(false)
  const toast = useToast()

  const save = async () => {
    await saveSettings({ endpoint: endpoint.trim(), token: token.trim() })
    toast.show('সেভ হয়েছে')
  }

  return (
    <>
      <TopBar title="অনলাইন খাতা" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t("হিসাব প্রথমে ফোনে লেখা হয়, তারপর নেট পেলে নিজে থেকেই অনলাইনে চলে যায়। ঠিকানা না দিলেও অ্যাপ পুরোপুরি চলে — তখন খাতাটা শুধু এই ফোনেই থাকে।")}
        </p>
        <Field label="সার্ভারের ঠিকানা">
          <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://site-khata.___.workers.dev" inputMode="url" autoCapitalize="off" spellCheck={false} />
        </Field>
        <Field label="গোপন টোকেন">
          <input className="input" value={token} onChange={(e) => setToken(e.target.value)}
            autoCapitalize="off" spellCheck={false} />
        </Field>
        <div className="actionbar" style={{ borderTop: 0, padding: '.2rem 0 1rem' }}>
          <button className="btn ghost" disabled={!!busy} onClick={async () => {
            setBusy('test')
            const err = await testEndpoint(endpoint.trim(), token.trim())
            setBusy('')
            toast.show(err || 'যোগাযোগ ঠিক আছে')
          }}>{busy === 'test' ? t('দেখছি…') : t('পরীক্ষা করুন')}</button>
          <button className="btn primary" onClick={save}>{t("সেভ করুন")}</button>
        </div>

        <div className="divider" />
        <div className="card">
          <div className="spread">
            <span>{t("পাঠানো বাকি")}</span>
            <strong className="num">{tf('{0} লাইন', toBn(s.outbox.length))}</strong>
          </div>
          {s.sync_error && <p className="small" style={{ color: 'var(--crit)', marginTop: '.4rem' }}>{s.sync_error}</p>}
          <button className="btn quiet small" style={{ marginTop: '.7rem' }} disabled={!s.outbox.length}
            onClick={async () => { const r = await flush(true); toast.show(r.error || tf('{0} লাইন পাঠানো হল', toBn(r.sent))) }}>
            {t("এখনই পাঠান")}
          </button>
        </div>

        <div className="card">
          <div className="spread">
            <span>{t("রাতের হিসাব")}</span>
            <span className="small muted">{s.brief ? agoBn(s.brief.generated_at) : t('এখনও আসেনি')}</span>
          </div>
          <button className="btn quiet small" style={{ marginTop: '.7rem' }} disabled={!!busy || !s.settings.endpoint}
            onClick={async () => {
              setBusy('brief')
              const err = await fetchBrief(false)
              setBusy('')
              toast.show(err || 'রাতের হিসাব এসে গেছে')
            }}>{busy === 'brief' ? t('আনছি…') : t('এখন আনুন')}</button>
        </div>

        <p className="sectionlabel">{t("নতুন ফোনে")}</p>
        <div className="card">
          <p className="small muted">
            {t("ফোন হারালে বা বদলালে — নতুন ফোনে এই একই ঠিকানা আর টোকেন বসিয়ে নিচের বোতামটা টিপুন। যা যা অনলাইনে গিয়েছিল, সব ফিরে আসবে। এই ফোনে যা আছে তা মুছবে না।")}
          </p>
          <button className="btn quiet small" style={{ marginTop: '.7rem' }} disabled={!!busy || !s.settings.endpoint}
            onClick={() => setConfirmRestore(true)}>
            {busy === 'restore' ? t('নামছে…') : t('অনলাইন থেকে ফিরিয়ে আনুন')}
          </button>
        </div>

        <p className="small muted" style={{ marginTop: '1rem' }}>
          {t("এই টোকেন দিয়ে শুধু এই খাতায় লেখা আর পড়া যায় — আর কারও হিসাব নয়, আর মুছে ফেলাও যায় না।")}
        </p>
      </div>
      {confirmRestore && (
        <Sheet title="অনলাইন থেকে ফিরিয়ে আনবেন?" onClose={() => setConfirmRestore(false)}>
          <p className="hint">{t("যা যা অনলাইনে আছে সব এই ফোনে যোগ হবে। এই ফোনের কোনো লেখা মুছবে না।")}</p>
          <div className="actionbar" style={{ borderTop: 0, padding: '.6rem 0 0' }}>
            <button className="btn ghost" onClick={() => setConfirmRestore(false)}>{t("থাক")}</button>
            <button className="btn primary" onClick={async () => {
              setConfirmRestore(false)
              setBusy('restore')
              const r = await restoreFromServer()
              setBusy('')
              toast.show(r.error || tf('{0} লাইন ফিরে এসেছে', toBn(r.entries)))
            }}>{t("ফিরিয়ে আনুন")}</button>
          </div>
        </Sheet>
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* ---------- masters ---------- */

export function ProjectsPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Project | null>(null)
  const [delConfirm, setDelConfirm] = useState(false)
  const open = (p: Project | null) => { setDelConfirm(false); setEdit(p) }
  const list = allProjects(s)
  const blank = (): Project => ({
    id: uid(), kind: 'project', name_bn: '', client_bn: '', ptype: HOUSE, area_sqft: null,
    budget: null, start_date: isoDate(), plan_days: null, status: 'active', updated_at: '',
  })
  return (
    <>
      <TopBar title="কাজ" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>{t("একটা কাজ যোগ করুন — তারপর রোজকার হিসাব শুরু।")}</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((p) => (
            <Pick key={p.id} title={p.name_bn} sub={`${p.client_bn || t('খদ্দের লেখা নেই')} · ${p.status === 'active' ? t('চলছে') : t('শেষ')}`}
              right={<span className="num small">{p.budget ? money(p.budget) : ''}</span>} onClick={() => open(p)} />
          ))}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন কাজ'} onClose={() => { setEdit(null); setDelConfirm(false) }}>
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
              <Chip on={edit.status === 'active'} onClick={() => setEdit({ ...edit, status: 'active' })}>{t("চলছে")}</Chip>
              <Chip on={edit.status === 'done'} onClick={() => setEdit({ ...edit, status: 'done' })}>{t("শেষ")}</Chip>
            </div>
          </Field>
          <button className="btn primary" disabled={!edit.name_bn.trim()} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>{t("সেভ করুন")}</button>
          {/* Delete only shows once a job actually exists. Two taps, because it
              takes the job off every list — its already-written rows stay in the
              ledger (nothing there can be un-happened), but the job stops
              appearing and stops counting on the dashboard. */}
          {list.some((p) => p.id === edit.id) && (
            <button className="btn ghost" style={{ marginTop: '.6rem', width: '100%', color: 'var(--crit)', borderColor: 'var(--crit)' }}
              onClick={async () => {
                if (!delConfirm) { setDelConfirm(true); return }
                await saveMaster({ ...edit, deleted: true })
                setEdit(null); setDelConfirm(false)
              }}>
              {delConfirm ? t('হ্যাঁ, কাজটা মুছে ফেলুন') : t('কাজটা মুছে ফেলুন')}
            </button>
          )}
        </Sheet>
      )}
    </>
  )
}

export function WorkersPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Worker | null>(null)
  const [book, setBook] = useState(false)
  const list = allWorkers(s)
  const blank = (): Worker => ({ id: uid(), kind: 'worker', name_bn: '', rate: 0, phone: '', active: true, updated_at: '' })
  return (
    <>
      <TopBar title="লোকজন" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>{t("যাদের রোজ মজুরি দেন তাদের একবার বসিয়ে নিন।")}</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((w) => (
            <Pick key={w.id} title={w.name_bn} sub={w.active ? undefined : t('এখন কাজ করছে না')}
              right={<span className="num">{money(w.rate)}</span>} onClick={() => setEdit(w)} />
          ))}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন লোক'} onClose={() => setEdit(null)}>
          <Field label="নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} autoFocus /></Field>
          <Field label="একদিনের মজুরি (টাকা)"><NumField value={edit.rate} onChange={(v) => setEdit({ ...edit, rate: v ?? 0 })} /></Field>
          {/* The mark inside the box opens the phone's own list and fills the
              name above along with the number. */}
          <Field label="ফোন">
            <PhoneField value={edit.phone} onChange={(v) => setEdit({ ...edit, phone: v })} onBook={() => setBook(true)} />
          </Field>
          <Field label="অবস্থা">
            <div className="chips">
              <Chip on={edit.active} onClick={() => setEdit({ ...edit, active: true })}>{t("কাজ করছে")}</Chip>
              <Chip on={!edit.active} onClick={() => setEdit({ ...edit, active: false })}>{t("এখন নেই")}</Chip>
            </div>
          </Field>
          <button className="btn primary" disabled={!edit.name_bn.trim() || !edit.rate} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>{t("সেভ করুন")}</button>
        </Sheet>
      )}
      {book && edit && (
        <ContactPicker onClose={() => setBook(false)} onPicked={(c) => {
          setBook(false)
          setEdit({ ...edit, name_bn: edit.name_bn.trim() || c.name, phone: c.phone })
        }} />
      )}
    </>
  )
}

export function ItemsPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Item | null>(null)
  const [pick, setPick] = useState(false)
  const list = allItems(s)
  const units = ['বস্তা', 'কেজি', 'পিস', 'ঘনফুট', 'ট্রাক', 'লিটার', 'ফুট']
  const blank = (): Item => ({ id: uid(), kind: 'item', name_bn: '', unit_bn: 'পিস', last_rate: null, active: true, updated_at: '' })
  return (
    <>
      <TopBar title="মাল" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        {list.length === 0 && <Empty>{t("মাল কেনার সময় নতুন নাম যোগ করা যায় — আগে থেকে বসাতেই হবে এমন নয়।")}</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          <Pick title="+ চেনা তালিকা থেকে যোগ করুন" sub="পাইপ, ফিটিংস, ভালভ, বাথরুম, বিদ্যুৎ — মাপ ইঞ্চিতে" onClick={() => setPick(true)} />
        </div>
        <div className="rowlist" style={{ marginTop: '.5rem' }}>
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
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>{t("সেভ করুন")}</button>
        </Sheet>
      )}
      {pick && <NewItemSheet onClose={() => setPick(false)} onCreated={() => setPick(false)} />}
    </>
  )
}

/* The phone book, read once and searched in memory. Nothing is imported in
   bulk: he taps one person, and only that name and number are written. */
export function ContactPicker({ onClose, onPicked }: { onClose: () => void; onPicked: (c: PhoneContact) => void }) {
  const [state, setState] = useState<{ loading: boolean; error: string; rows: PhoneContact[] }>({ loading: true, error: '', rows: [] })
  const [q, setQ] = useState('')

  /* Try the system picker first — it is one tap and reads nothing else. Only
     if that is unavailable do we read the book into a searchable list. */
  useEffect(() => {
    let alive = true
    void (async () => {
      const one = await pickOneContact()
      if (!alive) return
      if (one.ok && one.contact) { onPicked(one.contact); return }
      const all = await readContacts()
      if (!alive) return
      setState({ loading: false, error: all.ok ? all.error : (all.error || one.error), rows: all.contacts })
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line

  const needle = q.trim().toLowerCase()
  const rows = state.rows.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle)).slice(0, 60)
  return (
    <Sheet title="ফোনের তালিকা থেকে" onClose={onClose}>
      {state.loading && <p className="hint">{t('তালিকা আনা হচ্ছে…')}</p>}
      {!state.loading && state.rows.length === 0 && (
        <>
          <p className="hint">{t('ফোনের তালিকা খোলা গেল না। নামটা নিজে লিখে নিন।')}</p>
          {state.error && <p className="small muted" style={{ marginTop: '.4rem' }}>{state.error}</p>}
        </>
      )}
      {state.rows.length > 0 && (
        <>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম খুঁজুন" autoFocus />
          <div className="rowlist" style={{ marginTop: '.7rem' }}>
            {rows.map((c, k) => <Pick key={c.name + k} title={c.name} sub={c.phone} onClick={() => onPicked(c)} />)}
            {rows.length === 0 && <p className="hint">{t('এই নামে কিছু পাওয়া গেল না।')}</p>}
          </div>
        </>
      )}
    </Sheet>
  )
}

export function PartiesPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [edit, setEdit] = useState<Party | null>(null)
  const [filter, setFilter] = useState<'all' | 'supplier' | 'client'>('all')
  const [q, setQ] = useState('')
  const [book, setBook] = useState(false)
  const all = parties(s)
  // Twenty names in, scrolling is slower than reading. One box and two chips.
  const needle = q.trim().toLowerCase()
  const list = all
    .filter((p) => (filter === 'all' ? true : p.ptype === filter))
    .filter((p) => !needle || p.name_bn.toLowerCase().includes(needle) || (p.phone || '').includes(needle))
  const blank = (): Party => ({ id: uid(), kind: 'party', name_bn: '', ptype: 'supplier', terms_days: 0, phone: '', updated_at: '' })
  return (
    <>
      <TopBar title="দোকান ও খদ্দের" onBack={onBack} right={<button className="iconbtn" onClick={() => setEdit(blank())} aria-label="নতুন"><Icon name="plus" /></button>} />
      <div className="scroll">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম বা ফোন খুঁজুন" style={{ marginTop: '.9rem' }} />
        <div className="chips" style={{ marginTop: '.6rem' }}>
          <Chip on={filter === 'all'} onClick={() => setFilter('all')}>{t('সব')}</Chip>
          <Chip on={filter === 'supplier'} onClick={() => setFilter('supplier')}>{t('দোকান')}</Chip>
          <Chip on={filter === 'client'} onClick={() => setFilter('client')}>{t('খদ্দের')}</Chip>
        </div>
        {all.length === 0 && <Empty>{t("মাল কেনার সময় দোকানের নাম যোগ করা যায়।")}</Empty>}
        {all.length > 0 && list.length === 0 && <Empty>{t('এই নামে কিছু পাওয়া গেল না।')}</Empty>}
        <div className="rowlist" style={{ marginTop: '.9rem' }}>
          {list.map((p) => (
            <Pick key={p.id} title={p.name_bn}
              sub={(p.ptype === 'supplier' ? tf('{0} দিনের বাকি', toBn(p.terms_days)) : t('খদ্দের')) + (p.phone ? ' · ' + p.phone : '')}
              onClick={() => setEdit(p)} />
          ))}
        </div>
      </div>
      {/* Reached from the mark inside the phone box, so a sheet is already
          open: keep whatever he has typed, and only fill a name he has not. */}
      {book && (
        <ContactPicker onClose={() => setBook(false)} onPicked={(c) => {
          setBook(false)
          setEdit((e) => ({ ...(e || blank()), name_bn: (e?.name_bn || '').trim() || c.name, phone: c.phone }))
        }} />
      )}
      {edit && (
        <Sheet title={edit.name_bn || 'নতুন'} onClose={() => setEdit(null)}>
          <Field label="নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} autoFocus /></Field>
          <Field label="কী">
            <div className="chips">
              <Chip on={edit.ptype === 'supplier'} onClick={() => setEdit({ ...edit, ptype: 'supplier' })}>{t("দোকান")}</Chip>
              <Chip on={edit.ptype === 'client'} onClick={() => setEdit({ ...edit, ptype: 'client' })}>{t("খদ্দের")}</Chip>
            </div>
          </Field>
          {edit.ptype === 'supplier' && (
            <Field label="কত দিনের বাকিতে দেয়"><NumField value={edit.terms_days} onChange={(v) => setEdit({ ...edit, terms_days: v ?? 0 })} /></Field>
          )}
          {/* The mark inside the box opens the phone's own list and fills the
              name above along with the number. */}
          <Field label="ফোন">
            <PhoneField value={edit.phone} onChange={(v) => setEdit({ ...edit, phone: v })} onBook={() => setBook(true)} />
          </Field>
          <button className="btn primary" disabled={!edit.name_bn.trim()} style={{ marginTop: '.5rem' }}
            onClick={async () => { await saveMaster(edit); setEdit(null) }}>{t("সেভ করুন")}</button>
        </Sheet>
      )}
    </>
  )
}

export function StagesPage({ s, onBack }: { s: State; onBack: () => void }) {
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
        <div className="card" style={{ marginTop: '.9rem' }}>
          <p className="small muted">
            {t('ধাপ মানে একটা বাড়ি তোলার পর্বগুলো — ভিত, কলাম, ছাদ, প্লাস্টার। রোজকার হিসাবে ‘কাজ কতদূর’ জিজ্ঞেস করার সময় আপনি শুধু বলেন কোন ধাপটা শেষ হল; শতকরা কত হল তা এখান থেকে বেরোয়।')}
          </p>
          <p className="small muted" style={{ marginTop: '.5rem' }}>
            {t('থাম্ব রুল মানে প্রতি বর্গফুটে কত মাল লাগে — যেমন ০.৪ বস্তা সিমেন্ট। নতুন কাজের দর বানানোর সময় এটাই ব্যবহার হয়।')}
          </p>
        </div>
        {list.length === 0 && (
          <>
            <Empty>{t("কাজের ধাপ বসানো না থাকলে অগ্রগতি হিসাব হয় না।")}</Empty>
            <button className="btn quiet" style={{ width: '100%' }}
              onClick={async () => { await seedHouse(allItems(s)); toast.show('ঘর তৈরির চেনা ধাপ বসানো হল — নিজের মতো বদলে নিন') }}>
              {t("ঘর তৈরির চেনা ধাপ বসিয়ে দিন")}
            </button>
          </>
        )}

        {types.map((ptype) => (
          <div key={ptype}>
            <p className="sectionlabel">{t(ptype)} — {t('ধাপ')} {weight !== 100 && <span style={{ color: 'var(--warn)' }}>{tf('(ওজনের যোগফল {0}, ১০০ হওয়া দরকার)', toBn(weight))}</span>}</p>
            <div className="card">
              {list.filter((x) => x.project_type === ptype).map((st) => (
                <button className="review-row" key={st.id} onClick={() => setEdit(st)}>
                  <span><span className="t">{toBn(st.seq)}. {t(st.name_bn)}</span></span>
                  <span className="v num">{toBn(st.weight)}</span>
                  <Icon name="fwd" size={16} />
                </button>
              ))}
            </div>
            <p className="sectionlabel">{t(ptype)} — {t('প্রতি বর্গফুটে')}</p>
            <div className="card">
              {cf.filter((x) => x.project_type === ptype).map((c) => (
                <button className="review-row" key={c.id} onClick={() => setEditC(c)}>
                  <span><span className="t">{nameOf(s, c.item_id)}</span></span>
                  <span className="v num">{num(c.per_sqft, 2)}</span>
                  <Icon name="fwd" size={16} />
                </button>
              ))}
              {cf.filter((x) => x.project_type === ptype).length === 0 && <p className="hint">{t("কিছু বসানো নেই।")}</p>}
            </div>
          </div>
        ))}

        <p className="small muted" style={{ marginTop: '1.2rem' }}>
          {t("ধাপের ওজন মিলে ১০০ হলে ‘কাজ কতদূর’ থেকে শতকরা নিজে থেকেই বেরোয়। থাম্ব রুল দিয়ে নতুন কাজের হিসাব হয় — কাজ শেষে আসল খরচ দেখে এগুলো ঠিক করে নেবেন।")}
        </p>
      </div>
      {edit && (
        <Sheet title={edit.name_bn} onClose={() => setEdit(null)}>
          <Field label="ধাপের নাম"><input className="input" value={edit.name_bn} onChange={(e) => setEdit({ ...edit, name_bn: e.target.value })} /></Field>
          <Field label="এই ধাপটা গোটা কাজের কত ভাগ?">
            <NumField value={edit.weight} onChange={(v) => setEdit({ ...edit, weight: v ?? 0 })} decimal />
          </Field>
          <p className="small muted" style={{ marginTop: '-.5rem', marginBottom: '.8rem' }}>
            {t('সব ধাপের ভাগ যোগ করলে ১০০ হওয়া চাই। ছাদ ঢালাই গোটা কাজের প্রায় এক-পঞ্চমাংশ হলে এখানে ২০ বসান।')}
          </p>
          <button className="btn primary" style={{ marginTop: '.5rem' }} onClick={async () => { await saveMaster(edit); setEdit(null) }}>{t("সেভ করুন")}</button>
        </Sheet>
      )}
      {editC && (
        <Sheet title={nameOf(s, editC.item_id)} onClose={() => setEditC(null)}>
          <Field label="প্রতি বর্গফুটে কত"><NumField value={editC.per_sqft} onChange={(v) => setEditC({ ...editC, per_sqft: v ?? 0 })} decimal /></Field>
          <button className="btn primary" style={{ marginTop: '.5rem' }} onClick={async () => { await saveMaster(editC); setEditC(null) }}>{t("সেভ করুন")}</button>
        </Sheet>
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

export function CashPage({ s, onBack }: { s: State; onBack: () => void }) {
  const [amount, setAmount] = useState<number | null>(s.settings.opening_cash)
  const cash = cashState(s.entries, s.settings.opening_cash, s.settings.opening_date)
  const toast = useToast()
  return (
    <>
      <TopBar title="হাতের টাকা" onBack={onBack} />
      <div className="scroll">
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="spread"><span>{t("এখন হিসাবমতো")}</span><strong className="num" style={{ fontSize: '1.3rem' }}>{money(cash.computed)}</strong></div>
          <p className="small muted" style={{ marginTop: '.4rem' }}>
            শেষ গোনা {dateBn(cash.anchor_date, false)} — {money(cash.anchor_amount)}। তারপর ঢুকেছে {money(cash.in_since)}, বেরিয়েছে {money(cash.out_since)}।
          </p>
        </div>
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t("রোজকার হিসাবের শেষে টাকা গুনলে এই সংখ্যাটা নিজে থেকেই ঠিক হয়ে যায়। প্রথম দিনের জন্য শুধু একবার শুরুর টাকাটা বসিয়ে দিন।")}
        </p>
        <Field label="শুরুর টাকা"><NumField value={amount} onChange={setAmount} /></Field>
        <button className="btn primary" onClick={async () => {
          await saveSettings({ opening_cash: amount ?? 0, opening_date: isoDate() })
          toast.show('সেভ হয়েছে')
        }}>{t("সেভ করুন")}</button>
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
    toast.show(r.ok ? tf('রাখা হল — {0}', r.where) : t('রাখা গেল না'))
  }
  return (
    <>
      <TopBar title="ব্যাকআপ" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t("পুরো খাতাটা একটা ফাইলে বেরিয়ে আসে, ফোনের Documents ফোল্ডারে। মাসে একবার করে রাখলে ফোন হারালেও হিসাব থাকে।")}
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

/* One switch, two languages. It takes effect on the next paint — the ledger
   underneath is untouched, since every stored row stays in Bengali and only
   the rendering changes. */
function LangPage({ s, onBack }: { s: State; onBack: () => void }) {
  const cur = s.settings.lang
  return (
    <>
      <TopBar title="ভাষা" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t('একই খাতা, একই সংখ্যা — শুধু লেখাগুলো বদলায়। যা লিখে রেখেছেন, যেমন লোকের নাম বা মালের নাম, সেগুলো যেমন লিখেছেন তেমনই থাকে।')}
        </p>
        <div className="rowlist">
          <Pick on={cur === 'bn'} title="বাংলা" sub="সংখ্যাও বাংলায় — ১,২৫০"
            right={<Icon name="check" size={18} />} onClick={() => void saveSettings({ lang: 'bn' })} />
          <Pick on={cur === 'en'} title="English" sub="Same app, English words — 1,250"
            right={<Icon name="check" size={18} />} onClick={() => void saveSettings({ lang: 'en' })} />
        </div>
        <div className="card" style={{ marginTop: '1.4rem' }}>
          <p className="small muted">{t('নমুনা')}</p>
          <div className="spread" style={{ marginTop: '.4rem' }}>
            <span>{t('আজকের মজুরি')}</span>
            <strong className="num" style={{ fontSize: '1.3rem' }}>{money(4820)}</strong>
          </div>
        </div>
      </div>
    </>
  )
}

/* Reminders. The phone says it out loud on the morning it matters; nothing
   leaves the phone to make that happen. */
const REMIND_LABEL: Record<RemindWhen, string> = {
  off: 'বন্ধ', same: 'যেদিন দিতে হবে', day: 'একদিন আগে', three: 'তিনদিন আগে',
}

function RemindPage({ s, onBack }: { s: State; onBack: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  /* Preview exactly what reschedule() will queue — including the dates he set
     for himself (দিতে হবে), which live in masters as bills. Leaving billRows
     off here was the reason a বill he had just added showed nothing under
     ‘এখন যা যা মনে করানো হবে’, even though the phone had it queued. */
  const planned = useMemo(
    () => plan(s.entries, s.settings.remind, 9, s.masters.filter((m) => m.kind === 'bill') as Bill[]),
    [s.entries, s.settings.remind, s.masters],
  )

  const choose = async (w: RemindWhen) => {
    await saveSettings({ remind: w })
    setBusy(true)
    const r = await reschedule()
    setBusy(false)
    toast.show(r.ok ? (w === 'off' ? t('তাগাদা বন্ধ করা হল') : tf('{0}টা তাগাদা রাখা হল', toBn(r.count))) : r.error)
  }

  return (
    <>
      <TopBar title="টাকার তাগাদা" onBack={onBack} />
      <div className="scroll">
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t('কাকে টাকা দিতে হবে আর কার কাছ থেকে পাওনা আছে — তারিখ এলে ফোন নিজেই মনে করিয়ে দেবে। সকাল ৯টায়।')}
        </p>
        <div className="rowlist">
          {(['day', 'same', 'three', 'off'] as RemindWhen[]).map((w) => (
            <Pick key={w} on={s.settings.remind === w} title={REMIND_LABEL[w]}
              sub={w === 'off' ? 'কিছু মনে করাবে না' : undefined}
              onClick={() => void choose(w)} disabled={busy} />
          ))}
        </div>
        <p className="sectionlabel">{t('এখন যা যা মনে করানো হবে')}</p>
        {planned.length === 0 && <Empty>{t('এখন কোনো তারিখ বাকি নেই।')}</Empty>}
        {planned.length > 0 && (
          <div className="card">
            {planned.slice(0, 8).map((r) => (
              <div className="review-row" key={r.id}>
                <span><span className="t">{r.body}</span><span className="k">{dateBn(isoDate(r.at), false)}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast.msg && <Toast text={toast.msg} />}
    </>
  )
}

/* The only screen in the app that destroys anything. Hence the code, the
   backup offered first, and the two separate confirmations. */
function ResetPage({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('')
  const [alsoServer, setAlsoServer] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const run = async () => {
    setBusy(true)
    const r = await factoryReset(code, alsoServer)
    setBusy(false)
    if (!r.phone) { setMsg(r.error || 'কোড মিলল না'); return }
    // Nothing is left to render from; the cleanest end is a fresh start.
    location.reload()
  }

  return (
    <>
      <TopBar title="সব মুছে নতুন করে শুরু" onBack={onBack} />
      <div className="scroll">
        <div className="alert crit" style={{ marginTop: '1rem' }}>
          <span className="dot" />
          <span>{t('সব হিসাব, সব নাম, সব মজুত মুছে যাবে। ফেরানোর কোনো উপায় নেই — আগে সেটিংস → ব্যাকআপ থেকে একটা কপি রেখে দিন।')}</span>
        </div>

        <Field label="গোপন কোড">
          <input className="input num" value={code} inputMode="numeric" autoComplete="off"
            onChange={(e) => { setCode(e.target.value); setMsg('') }} />
        </Field>

        <div className="rowlist">
          <Pick on={alsoServer} title="অনলাইন খাতাও মুছে দিন"
            sub={alsoServer ? 'সার্ভারের কপিও খালি হবে' : 'শুধু এই ফোন খালি হবে'}
            onClick={() => setAlsoServer(!alsoServer)} />
        </div>

        {msg && <p className="small" style={{ color: 'var(--crit)' }}>{t(msg)}</p>}
      </div>
      <div className="actionbar">
        {!confirmed ? (
          <button className="btn ghost" disabled={code.trim().length < 4} onClick={() => setConfirmed(true)}>{t('মুছে ফেলুন')}</button>
        ) : (
          <button className="btn primary" style={{ background: 'var(--crit)' }} disabled={busy} onClick={run}>
            {busy ? t('মোছা হচ্ছে…') : t('হ্যাঁ, সব মুছে দিন')}
          </button>
        )}
      </div>
    </>
  )
}

function DisplayPage({ s, onBack }: { s: State; onBack: () => void }) {
  return (
    <>
      <TopBar title="লেখার আকার ও রং" onBack={onBack} />
      <div className="scroll">
        <p className="sectionlabel">{t("লেখার আকার")}</p>
        <div className="chips">
          {[
            ['ছোট', 0.92], ['সাধারণ', 1], ['বড়', 1.12], ['আরও বড়', 1.26],
          ].map(([label, v]) => (
            <Chip key={String(label)} on={Math.abs(s.settings.text_scale - (v as number)) < 0.01}
              onClick={() => void saveSettings({ text_scale: v as number })}>{label as string}</Chip>
          ))}
        </div>
        <p className="sectionlabel">{t("রং")}</p>
        <div className="chips">
          {[['ফোনের মতো', 'system'], ['আলো', 'light'], ['অন্ধকার', 'dark']].map(([label, v]) => (
            <Chip key={v} on={s.settings.theme === v} onClick={() => void saveSettings({ theme: v as 'system' | 'light' | 'dark' })}>{label}</Chip>
          ))}
        </div>
        <div className="card" style={{ marginTop: '1.4rem' }}>
          <p className="small muted">{t("নমুনা")}</p>
          <div className="spread" style={{ marginTop: '.4rem' }}><span>{t("আজকের মজুরি")}</span><strong className="num" style={{ fontSize: '1.3rem' }}>{money(4820)}</strong></div>
        </div>
      </div>
    </>
  )
}

