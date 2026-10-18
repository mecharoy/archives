import { useEffect, useState, useCallback, useRef } from 'react'
import { Home } from './screens/Home'
import { Work } from './screens/Work'
import { Money } from './screens/Money'
import { DayWizard } from './screens/day/DayWizard'
import { Shop } from './screens/Shop'
import { StockCount } from './screens/StockCount'
import { Personal } from './screens/Personal'
import { Estimator } from './screens/Estimator'
import { Settings, ProjectsPage, WorkersPage, ItemsPage, PartiesPage, StagesPage, CashPage } from './screens/Settings'
import { History } from './screens/History'
import { Enquiries } from './screens/Enquiries'
import { Onboarding } from './screens/Onboarding'
import { Tour, type Stop } from './ui/Tour'
import { TabCtx, type Tab } from './ui/TabBar'
import { goBack } from './lib/back'
import { useStore, activeProjects, allWorkers, saveSettings } from './lib/store'
import { startSyncLoop } from './lib/sync'
import { refreshUpdate } from './lib/update'
import { reschedule } from './lib/remind'
import { useToast, Toast } from './ui/kit'
import { isoDate, dayLabelBn } from './lib/bn'
import { tf } from './lib/i18n'
import type { Draft } from './lib/draft'

/* Four tabs along the bottom (ui/TabBar.tsx) and, over them, a stack of screens opened from a tab: today's
   entry, Settings, an old day, the price of a new job. Back closes the top screen; with none open it goes
   to আজ; from আজ it leaves the app. A sheet or a step inside a screen claims Back first (lib/back.ts). */
export type { Tab }
export type Screen =
  | 'day' | 'estimate' | 'settings' | 'history' | 'personal' | 'fullcount'
  | 'projects' | 'workers' | 'items' | 'parties' | 'stages' | 'cash' | 'enquiries'

/* Three stops, one sentence each, in the order he will use them. A stop whose control is not on the screen
   (nobody owes him yet) is skipped. */
export const HOME_TOUR: Stop[] = [
  { target: 'today', title: 'রোজ শুধু এইটুকু', body: 'রোজ সন্ধেবেলা এখানে চাপুন।', place: 'below' },
  { target: 'tabs', title: 'চারটে ঘর', body: 'নিচে চারটে ঘর: আজ, কাজ, দোকান, টাকা।', place: 'above' },
  { target: 'owed', title: 'টাকা পাবেন', body: 'কে কত টাকা দেবে, এখানে। ফোন এক চাপে।', place: 'above' },
]

export function App() {
  const state = useStore((s) => s)
  const ready = state.ready
  const settings = state.settings
  const needsSetup = ready && !settings.onboarded && activeProjects(state).length === 0 && allWorkers(state).length === 0

  const tabs: Tab[] = ['today', ...(settings.runs_sites ? ['work' as Tab] : []), ...(settings.runs_shop ? ['shop' as Tab] : []), 'money']
  const [tabRaw, setTab] = useState<Tab>('today')
  const tab = tabs.includes(tabRaw) ? tabRaw : 'today'
  const [stack, setStack] = useState<Screen[]>([])
  const screen = stack[stack.length - 1]
  const push = useCallback((s: Screen) => setStack((v) => [...v, s]), [])
  const pop = useCallback(() => setStack((v) => v.slice(0, -1)), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const goTab = useCallback((t: Tab) => { setTab(t); setStack([]); setDraft(null) }, [])
  const toast = useToast()

  /* The walk round runs once, the first time he lands on a set-up home screen, after the paint. showTour is
     also what Settings flips to run it again on demand. */
  const [showTour, setShowTour] = useState(false)
  useEffect(() => {
    if (!ready || needsSetup || settings.toured) return
    const timer = setTimeout(() => setShowTour(true), 900)
    return () => clearTimeout(timer)
  }, [ready, needsSetup, settings.toured])

  /* Settings asks for it again by clearing the flag; every stop is on আজ, so it goes there. */
  useEffect(() => {
    if (settings.toured || !ready || needsSetup) return
    goTab('today')
  }, [settings.toured]) // eslint-disable-line

  useEffect(() => { startSyncLoop() }, [])

  /* A reminder that names a screen opens it: 8 am → আজ, 8 pm → today's entry, dues → টাকা. */
  useEffect(() => {
    let remove: (() => void) | undefined
    void (async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const h = await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
          const to = a.notification.extra?.screen
          if (to === 'payments') goTab('money')
          else if (to === 'day') { setTab('today'); setDraft(null); setStack(['day']) }
          else if (to === 'home') goTab('today')
        })
        remove = () => void h.remove()
      } catch { /* browser */ }
    })()
    return () => remove?.()
  }, [goTab])

  /* Look for a newer build every time the app is opened, and again whenever it comes back to the front. */
  useEffect(() => {
    void refreshUpdate()
    let remove: (() => void) | undefined
    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app')
        const h = await CapApp.addListener('resume', () => { void refreshUpdate() })
        remove = () => void h.remove()
      } catch { /* browser */ }
    })()
    return () => remove?.()
  }, [])

  /* Reminders are rebuilt whenever the ledger, the switches or the brief change — a bill paid this evening
     must not nag him tomorrow, and the 8 am note carries the latest lines. Cheap: cancel ours, plan afresh. */
  const entryCount = state.entries.length
  useEffect(() => {
    if (!ready || needsSetup) return
    void reschedule()
  }, [ready, needsSetup, entryCount, settings.remind, settings.onboarded, settings.notify_morning, settings.notify_evening, settings.notify_monday, state.brief?.generated_at])

  /* theme and text size follow the settings, and the Android status bar follows the theme. */
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
    root.style.setProperty('--scale', String(settings.text_scale))
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    void (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
        await StatusBar.setBackgroundColor({ color: dark ? '#161B1E' : '#FFFFFF' })
      } catch { /* browser */ }
    })()
  }, [settings.theme, settings.text_scale])

  const openDay = useCallback((d: Draft | null) => { setDraft(d); push('day') }, [push])

  /* Back, innermost first: a sheet or a step claims it; then the top screen closes; then any tab but আজ goes
     to আজ; only from আজ does it leave the app. Kept in a ref so the phone's listener always reads it fresh. */
  const shellBack = useRef<() => boolean>(() => false)
  shellBack.current = () => {
    if (goBack()) return true
    if (stack.length) { if (screen === 'day') setDraft(null); pop(); return true }
    if (tab !== 'today') { setTab('today'); return true }
    return false
  }
  useEffect(() => {
    let remove: (() => void) | undefined
    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app')
        const h = await CapApp.addListener('backButton', () => { if (!shellBack.current()) void CapApp.exitApp() })
        remove = () => void h.remove()
      } catch { /* browser */ }
    })()
    // The screen checks press the same Back the phone's button does.
    if (import.meta.env.DEV) (window as unknown as { __shellBack: () => boolean }).__shellBack = () => shellBack.current()
    return () => remove?.()
  }, [])

  if (!ready) return <div className="app" />

  if (needsSetup) {
    return (
      <div className="app" data-screen="setup">
        <Onboarding onDone={() => toast.show('সব তৈরি — সন্ধেবেলা আজকের হিসাব লিখবেন')} />
        {toast.msg && <Toast text={toast.msg} />}
      </div>
    )
  }

  const back = () => { if (screen === 'day') setDraft(null); pop() }

  return (
    <TabCtx.Provider value={{ tab, tabs, go: goTab }}>
      <div className="app" data-screen="main">
        {!screen && tab === 'today' && <Home onDay={() => openDay(null)} onGo={push} onTab={goTab} />}
        {!screen && tab === 'work' && <Work onGo={push} />}
        {!screen && tab === 'shop' && <Shop onGo={push} />}
        {!screen && tab === 'money' && <Money onGo={push} />}

        {screen === 'day' && (
          <DayWizard start={draft} onExit={(saved, date) => {
            setDraft(null); setStack([]); setTab('today')
            if (saved) toast.show(!date || date === isoDate() ? 'আজকের হিসাব লেখা হল' : tf('{0}-এর হিসাব লেখা হল', dayLabelBn(date)))
          }} />
        )}
        {screen === 'fullcount' && <StockCount s={state} onDone={(msg) => { pop(); if (msg) toast.show(msg) }} />}
        {screen === 'personal' && <Personal onBack={back} />}
        {screen === 'estimate' && <Estimator onBack={back} />}
        {screen === 'settings' && <Settings onBack={back} />}
        {screen === 'history' && <History onBack={back} onEnterDate={(d) => openDay(d)} />}
        {screen === 'projects' && <ProjectsPage s={state} onBack={back} />}
        {screen === 'workers' && <WorkersPage s={state} onBack={back} />}
        {screen === 'items' && <ItemsPage s={state} onBack={back} />}
        {screen === 'parties' && <PartiesPage s={state} onBack={back} />}
        {screen === 'stages' && <StagesPage s={state} onBack={back} />}
        {screen === 'cash' && <CashPage s={state} onBack={back} />}
        {screen === 'enquiries' && <Enquiries onBack={back} />}

        {/* Only once, only on আজ, and only after setup — a tour over a half-finished form is worse than none. */}
        {!screen && tab === 'today' && showTour && (
          <Tour stops={HOME_TOUR} onDone={() => { setShowTour(false); void saveSettings({ toured: true }) }} />
        )}
        {toast.msg && <Toast text={toast.msg} />}
      </div>
    </TabCtx.Provider>
  )
}
