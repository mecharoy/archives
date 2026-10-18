import { createContext, useContext } from 'react'
import { Icon } from './kit'
import { t } from '../lib/i18n'

/* The four places along the bottom, like WhatsApp's: আজ (the evening and who owes him), কাজ (the jobs),
   দোকান (the shop), টাকা (cash and dues). He always sees where he is. The shell decides which show (no shop,
   no দোকান) and which is open; every tab's main page draws the bar at its foot, and screens opened from a
   tab — today's entry, Settings — leave it out. */

export type Tab = 'today' | 'work' | 'shop' | 'money'

export const TabCtx = createContext<{ tab: Tab; tabs: Tab[]; go: (t: Tab) => void } | null>(null)

const LOOK: Record<Tab, { label: string; icon: string }> = {
  today: { label: 'আজ', icon: 'calendar' },
  work: { label: 'কাজ', icon: 'helmet' },
  shop: { label: 'দোকান', icon: 'shop' },
  money: { label: 'টাকা', icon: 'wallet' },
}

export function TabBar() {
  const c = useContext(TabCtx)
  if (!c) return null
  return (
    <nav className="tabbar" data-tour="tabs">
      {c.tabs.map((k) => (
        <button key={k} className={k === c.tab ? 'on' : ''} aria-current={k === c.tab ? 'page' : undefined} onClick={() => c.go(k)}>
          <span className="ti"><Icon name={LOOK[k].icon} size={22} stroke={k === c.tab ? 2.1 : 1.8} /></span>
          <span className="tl">{t(LOOK[k].label)}</span>
        </button>
      ))}
    </nav>
  )
}
