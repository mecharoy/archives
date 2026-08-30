import { Icon, TopBar } from '../ui/kit'
import { t } from '../lib/i18n'
import type { Screen } from '../App'

/* সব কিছু — the exploded view. Every single thing the app can do, laid out
   flat under the section it belongs to, so nothing is more than one tap from
   home. Nothing new lives only here; each tile is a shortcut to the same
   screen the books open to. It exists so he never has to remember which book
   a thing was under — he opens this and sees all of it at once. */

type Item = { icon: string; title: string; sub: string; to: Screen }

const SECTIONS: { label: string; items: Item[] }[] = [
  {
    label: 'কাজ',
    items: [
      { icon: 'book', title: 'আজকের হিসাব', sub: 'রোজকার এন্ট্রি', to: 'day' },
      { icon: 'chart', title: 'কাজ ও অগ্রগতি', sub: 'সব সাইটের অবস্থা', to: 'work' },
      { icon: 'calc', title: 'নতুন কাজের হিসাব', sub: 'দর দেওয়ার আগে', to: 'estimate' },
      { icon: 'book', title: 'কাজ যোগ করা, বদলানো', sub: 'সাইটের নাম, দর', to: 'projects' },
      { icon: 'people', title: 'লোকজন', sub: 'কে, কত মজুরি', to: 'workers' },
      { icon: 'chart', title: 'কাজের ধাপ ও থাম্ব রুল', sub: 'অগ্রগতির নিয়ম', to: 'stages' },
    ],
  },
  {
    label: 'মজুত',
    items: [
      { icon: 'shop', title: 'দোকানের মজুত', sub: 'মাল ঢোকা, বিক্রি, গোনা', to: 'shop' },
      { icon: 'book', title: 'মালের তালিকা', sub: 'নাম, একক, শেষ দর', to: 'items' },
      { icon: 'contactbook', title: 'দোকান ও খদ্দের', sub: 'সরবরাহকারী, খদ্দের', to: 'parties' },
    ],
  },
  {
    label: 'হিসাব',
    items: [
      { icon: 'wallet', title: 'টাকা দেওয়া-নেওয়া', sub: 'বাকি মেটানো, পাওনা তোলা', to: 'payments' },
      { icon: 'lock', title: 'নিজের খরচ', sub: 'আলাদা খাতা', to: 'personal' },
      { icon: 'calc', title: 'হাতের টাকা গোনা', sub: 'নতুন করে বসানো', to: 'cash' },
      { icon: 'clock', title: 'পুরোনো হিসাব', sub: 'দেখা ও সংশোধন', to: 'history' },
    ],
  },
  {
    label: 'অন্যান্য',
    items: [
      { icon: 'gear', title: 'সেটিংস', sub: 'ভাষা, আকার, ব্যাকআপ, তাগাদা', to: 'settings' },
    ],
  },
]

export function AllFeatures({ onBack, onGo }: { onBack: () => void; onGo: (s: Screen) => void }) {
  return (
    <>
      <TopBar title="সব কিছু" onBack={onBack} />
      <div className="scroll">
        {SECTIONS.map((sec) => (
          <div key={sec.label}>
            <p className="sectionlabel">{t(sec.label)}</p>
            <div className="tilegrid">
              {sec.items.map((it) => (
                <button className="tile" key={it.title} onClick={() => onGo(it.to)}>
                  <Icon name={it.icon} size={24} stroke={1.6} />
                  <span>
                    <span className="t" style={{ display: 'block' }}>{t(it.title)}</span>
                    <span className="s">{t(it.sub)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
