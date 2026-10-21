import { useMemo, useState } from 'react'
import { Chip, Sheet, Field, NumField, PhoneField, Pick } from '../../ui/kit'
import { useStore, items, saveMaster } from '../../lib/store'
import { uid } from '../../lib/db'
import { searchCatalog, CATS, VARIANTS } from '../../lib/catalog'
import { ContactPicker } from '../Settings'
import type { Item, Party, Worker } from '../../lib/model'
import { t, tf } from '../../lib/i18n'

/* The three "add a new one" sheets the evening, the shop and the lists share: a thing, a man, a shop or
   customer. Moved here unchanged from the old one-screen wizard. */

/* Adding a new item: type the name, or tap it out of the common list. The
   catalogue is a lookup, not a suggestion — nothing in it exists in his ledger
   until he picks it, and the wizard's chips still come only from what he has
   actually bought. Whatever he types wins: the typed name is what gets saved
   if he presses যোগ করুন, and the list below is only ever a shortcut to it. */
/* `initial`: what he was searching for when nothing matched, so he need not type it twice. */
export function NewItemSheet({ onClose, onCreated, initial = '' }: { onClose: () => void; onCreated: (i: Item) => void; initial?: string }) {
  const s = useStore((x) => x)
  const [base, setBase] = useState(initial)
  const [variant, setVariant] = useState('')
  const [writing, setWriting] = useState<string | null>(null)   // which group's own-words box is open
  const [own, setOwn] = useState('')
  const [unit, setUnit] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const units = ['বস্তা', 'কেজি', 'পিস', 'ঘনফুট', 'ট্রাক', 'লিটার', 'ফুট', 'মিটার', 'বর্গফুট', 'প্যাকেট']
  const have = useMemo(() => new Set(items(s).map((i) => i.name_bn)), [s.masters])
  const found = useMemo(() => searchCatalog(base, cat, have).slice(0, 60), [base, cat, have])

  /* Name and size are kept apart while he is choosing and joined only on the
     way out. Inferring the size back out of the finished name is what made a
     chosen size impossible to un-choose: ১/২" ends with ২", so two chips lit
     at once and the wrong one came off. */
  const fullName = [base.trim(), variant.trim()].filter(Boolean).join(' ')

  const create = async (name_bn: string, unit_bn: string) => {
    const it: Item = { id: uid(), kind: 'item', name_bn, unit_bn, last_rate: null, active: true, updated_at: new Date().toISOString() }
    await saveMaster(it)
    onCreated(it)
  }

  const takeOwn = () => {
    const v = own.trim()
    if (v) setVariant(v)
    setOwn('')
    setWriting(null)
  }

  return (
    <Sheet title="নতুন মাল" onClose={onClose}>
      <Field label="মালের নাম"><input className="input" value={base} onChange={(e) => setBase(e.target.value)} placeholder="যেমন — সিমেন্ট" autoFocus /></Field>

      {base.trim() && (
        <Field label="মাপ বা ধরন (থাকলে)">
          {VARIANTS.map((g) => (
            <div key={g.group_bn} style={{ marginBottom: '.4rem' }}>
              <p className="small muted" style={{ margin: '.2rem 0' }}>{t(g.group_bn)}</p>
              <div className="chips">
                {g.values.map((v) => (
                  <Chip key={v} on={variant === v} onClick={() => setVariant(variant === v ? '' : v)}>{v}</Chip>
                ))}
                <Chip on={writing === g.group_bn} onClick={() => { setWriting(writing === g.group_bn ? null : g.group_bn); setOwn('') }}>
                  {t('+ নিজে লিখুন')}
                </Chip>
              </div>
              {writing === g.group_bn && (
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                  <input className="input" style={{ flex: 1 }} value={own} autoFocus
                    placeholder={t(g.group_bn === 'ইঞ্চি' ? '৫"' : g.group_bn === 'মিলিমিটার' ? '৩২ মিমি' : 'যেমন — গ্রেড ৫৩')}
                    onChange={(e) => setOwn(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') takeOwn() }} />
                  <button className="btn quiet small" disabled={!own.trim()} onClick={takeOwn}>{t('বসান')}</button>
                </div>
              )}
            </div>
          ))}
          {variant && (
            <div className="chips" style={{ marginTop: '.3rem' }}>
              <Chip on onClick={() => setVariant('')}>{variant} · {t('তুলে নিন')}</Chip>
            </div>
          )}
          <p className="small muted">{t('মাপ নামের সঙ্গেই থাকে, তাই ১" আর ২" পাইপের মজুত আলাদা করে গোনা হয়।')}</p>
        </Field>
      )}

      <Field label="কীসের হিসাবে">
        <div className="chips">
          {units.map((u) => <Chip key={u} on={unit === u} onClick={() => setUnit(unit === u ? '' : u)}>{u}</Chip>)}
        </div>
      </Field>

      {fullName && <p className="small muted" style={{ marginTop: '-.4rem' }}>{tf('যোগ হবে — {0} ({1})', fullName, t(unit || 'পিস'))}</p>}
      <button className="btn primary" disabled={!base.trim()} onClick={() => create(fullName, unit || 'পিস')} style={{ marginTop: '.6rem', width: '100%' }}>{t("যোগ করুন")}</button>

      <div className="divider" />
      <p className="sectionlabel" style={{ marginTop: 0 }}>{base.trim() ? t('চেনা তালিকায় যা মিলল') : t('চেনা তালিকা থেকে বেছে নিন')}</p>
      {!base.trim() && (
        <div className="chips">
          {CATS.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? null : c)}>{t(c)}</Chip>)}
        </div>
      )}
      {found.length > 0 && (
        <div className="rowlist" style={{ marginTop: '.6rem' }}>
          {found.map((c) => (
            <Pick key={c.name_bn} title={c.name_bn} sub={c.unit_bn} onClick={() => create(c.name_bn, c.unit_bn)} />
          ))}
        </div>
      )}
      {base.trim() && found.length === 0 && (
        <p className="small muted">{t("চেনা তালিকায় এই নামে কিছু নেই — উপরের ‘যোগ করুন’ টিপলেই নিজের নামে যোগ হয়ে যাবে।")}</p>
      )}
      {!base.trim() && !cat && (
        <p className="small muted">{t("পাইপ, ফিটিংস, ভালভ, বাথরুম, বিদ্যুৎ — মাপ ইঞ্চিতে। নাম টিপে বসালেই খোঁজাও যায়।")}</p>
      )}
    </Sheet>
  )
}

export function NewWorkerSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (w: Worker) => void }) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState<number | null>(null)
  const create = async () => {
    const w: Worker = {
      id: uid(), kind: 'worker', name_bn: name.trim(), rate: rate ?? 0,
      phone: '', active: true, updated_at: new Date().toISOString(),
    }
    await saveMaster(w)
    onCreated(w)
  }
  return (
    <Sheet title="নতুন লোক" onClose={onClose}>
      <Field label="নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="একদিনের মজুরি (টাকা)"><NumField value={rate} onChange={setRate} /></Field>
      <button className="btn primary" disabled={!name.trim() || !rate} onClick={create}
        style={{ marginTop: '.6rem', width: '100%' }}>{t("যোগ করুন")}</button>
    </Sheet>
  )
}

export function NewPartySheet({ onClose, onCreated, kind = 'supplier' }: { onClose: () => void; onCreated: (p: Party) => void; kind?: 'supplier' | 'client' }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState<number | null>(0)
  const [book, setBook] = useState(false)
  const create = async () => {
    const p: Party = { id: uid(), kind: 'party', name_bn: name.trim(), ptype: kind, terms_days: terms ?? 0, phone: phone.trim(), updated_at: new Date().toISOString() }
    await saveMaster(p)
    onCreated(p)
  }
  if (book) return <ContactPicker onClose={() => setBook(false)} onPicked={(c) => { setName(name.trim() || c.name); setPhone(c.phone); setBook(false) }} />
  return (
    <Sheet title={kind === 'supplier' ? t('নতুন দোকান') : t('নতুন খদ্দের')} onClose={onClose}>
      <Field label="নাম"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      {/* The person is almost certainly already in his phone. The mark inside
          the box fills both this and the name above in one tap. */}
      <Field label="ফোন (ইচ্ছে হলে)"><PhoneField value={phone} onChange={setPhone} onBook={() => setBook(true)} /></Field>
      {/* Customers have agreed days too: they fill in the date on a credit sale the way a shop's terms do. */}
      <Field label={kind === 'supplier' ? 'কত দিনের বাকিতে দেয় (না জানলে ০)' : 'কত দিনে টাকা দেয় (না জানলে ০)'}><NumField value={terms} onChange={setTerms} /></Field>
      <button className="btn primary" disabled={!name.trim()} onClick={create} style={{ marginTop: '.6rem', width: '100%' }}>{t("যোগ করুন")}</button>
    </Sheet>
  )
}
