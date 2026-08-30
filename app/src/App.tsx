import { useEffect, useState, useCallback } from 'react'
import { Home } from './screens/Home'
import { Work } from './screens/Work'
import { Money } from './screens/Money'
import { AllFeatures } from './screens/AllFeatures'
import { DayWizard } from './screens/DayWizard'
import { Shop } from './screens/Shop'
import { Personal } from './screens/Personal'
import { Estimator } from './screens/Estimator'
import { Settings, ProjectsPage, WorkersPage, ItemsPage, PartiesPage, StagesPage, CashPage } from './screens/Settings'
import { History } from './screens/History'
import { Payments } from './screens/Payments'
import { Onboarding } from './screens/Onboarding'
import { Tour, type Stop } from './ui/Tour'
import { goBack } from './lib/back'
import { useStore, activeProjects, allWorkers, saveSettings } from './lib/store'
import { startSyncLoop } from './lib/sync'
import { reschedule } from './lib/remind'
import { useToast, Toast } from './ui/kit'
import type { Draft } from './lib/draft'

/* Every place he can be. The home screen is the shelf; the three books
   (work, shop, money) each open onto their own screen, and "all" is the
   exploded view of every single thing the app can do — one tap from home. The
   master-edit pages (projects, workers, items…) are reachable both from
   inside the book they belong to and from that exploded view, so he never
   goes to a different place to edit a thing than the place he adds it. */
export type Screen =
  | 'home' | 'day' | 'work' | 'money' | 'all'
  | 'shop' | 'personal' | 'estimate' | 'settings' | 'history' | 'payments'
  | 'projects' | 'workers' | 'items' | 'parties' | 'stages' | 'cash'

/* Five stops, in the order he will use them. Kept short on purpose: a tour
   he skips teaches nothing, and the app is meant to be obvious without one. */
export const HOME_TOUR: Stop[] = [
  {
    target: 'today',
    title: 'রোজ শুধু এইটুকু',
    body: 'দিনের শেষে এখানে চাপুন। কে এসেছিল, কত মজুরি, কী মাল এল — কয়েকটা প্রশ্ন, তারপর শেষ। বাকি সব হিসাব এখান থেকেই নিজে থেকে তৈরি হয়।',
    place: 'below',
  },
  {
    target: 'brief',
    title: 'রাতে হিসাব দেখে নেওয়া হয়',
    body: 'আপনি ঘুমোলে রাতে সব হিসাব মিলিয়ে দেখা হয়, আর সকালে এখানে এক লাইনে লেখা থাকে কোনটায় আজ নজর দেওয়া দরকার। নিচে সেই কথাগুলোই বড় করে থাকে।',
    place: 'below',
  },
  {
    target: 'books',
    title: 'তিনটে খাতা এক পাতায়',
    body: 'কাজ, মজুত আর হিসাব — তিনটেরই মূল কথা এই পাতাতেই দেখা যায়। বিশদ দেখতে বা কিছু বদলাতে চাইলে ‘দেখুন’-এ চাপুন, ভিতরে সব একসাথে পাবেন।',
    place: 'above',
  },
  {
    target: 'standing',
    title: 'নিচে সব সময় তিনটে সংখ্যা',
    body: 'হাতে কত আছে, কত পাবেন, কত দেবেন — যে পাতাতেই থাকুন, নিচে এই তিনটে দেখা যাবে। চাপলে কে কত, তার তালিকা খুলবে।',
    place: 'above',
  },
  {
    target: 'all',
    title: 'সব কিছু এক জায়গায়',
    body: 'অ্যাপের প্রতিটা কাজ — মাল, লোক, দোকান, দর, ব্যাকআপ, ভাষা — এই একটা বোতামের ভিতরে সাজানো আছে। যা খুঁজছেন, এখানে চাপলেই পাবেন।',
    place: 'above',
  },
]

export function App() {
  const state = useStore((s) => s)
  const ready = state.ready
  const settings = state.settings
  const needsSetup = ready && !settings.onboarded && activeProjects(state).length === 0 && allWorkers(state).length === 0

  /* A small stack instead of a single screen, so going into লোকজন from কাজ
     and pressing back lands on কাজ, not all the way home. The top of the
     stack is what is drawn; home is always the floor. */
  const [stack, setStack] = useState<Screen[]>(['home'])
  const screen = stack[stack.length - 1]
  const push = useCallback((s: Screen) => setStack((v) => [...v, s]), [])
  const pop = useCallback(() => setStack((v) => (v.length > 1 ? v.slice(0, -1) : v)), [])
  const goHome = useCallback(() => { setStack(['home']); setDraft(null) }, [])

  const [draft, setDraft] = useState<Draft | null>(null)
  const toast = useToast()

  /* The walk round runs once, the first time he lands on a set-up home
     screen. It waits for the paint before it starts measuring, because a
     spotlight drawn against a half-laid-out screen points at nothing.
     showTour is also what Settings flips to run it again on demand. */
  const [showTour, setShowTour] = useState(false)
  useEffect(() => {
    if (!ready || needsSetup || settings.toured) return
    const timer = setTimeout(() => setShowTour(true), 900)
    return () => clearTimeout(timer)
  }, [ready, needsSetup, settings.toured])

  /* Settings asks for it again by clearing the flag; this picks that up and
     sends him home, because every stop on the tour is on the home screen. */
  useEffect(() => {
    if (settings.toured || !ready || needsSetup) return
    if (screen !== 'home') goHome()
  }, [settings.toured]) // eslint-disable-line

  useEffect(() => { startSyncLoop() }, [])

  /* Reminders are rebuilt whenever the ledger changes — a bill paid this
     evening must not nag him tomorrow morning. Cheap: it cancels ours and
     schedules what the current dues say. */
  const entryCount = state.entries.length
  useEffect(() => {
    if (!ready || settings.remind === 'off') return
    void reschedule()
  }, [ready, entryCount, settings.remind])

  /* theme and text size follow the settings, and the Android status bar
     follows the theme so the top of the screen never looks borrowed. */
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

  /* Android's back button must behave like the back arrow, not like a way to
     lose half an entry. */
  useEffect(() => {
    let remove: (() => void) | undefined
    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app')
        const h = await CapApp.addListener('backButton', () => {
          /* Innermost first: a sheet, a wizard step, a settings sub-page.
             Only when nothing claims the press does it mean "go back one
             screen", and only from home does it mean "leave the app". */
          if (goBack()) return
          if (stack.length > 1) { setDraft(null); pop() }
          else void CapApp.exitApp()
        })
        remove = () => void h.remove()
      } catch { /* browser */ }
    })()
    return () => remove?.()
  }, [stack.length, pop])

  if (!ready) return <div className="app" />

  if (needsSetup) {
    return (
      <div className="app">
        <Onboarding onDone={() => toast.show('শুরু হল — এবার আজকের হিসাব লিখুন')} />
        {toast.msg && <Toast text={toast.msg} />}
      </div>
    )
  }

  const back = () => { setDraft(null); pop() }

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          onDay={() => openDay(null)}
          onSameAsYesterday={(d) => openDay(d)}
          onGo={push}
        />
      )}
      {screen === 'work' && <Work onBack={back} onGo={push} />}
      {screen === 'money' && <Money onBack={back} onGo={push} />}
      {screen === 'all' && <AllFeatures onBack={back} onGo={push} />}
      {screen === 'day' && (
        <DayWizard start={draft} onExit={(saved) => { goHome(); if (saved) toast.show('আজকের হিসাব লেখা হল') }} />
      )}
      {screen === 'shop' && <Shop onBack={back} onGo={push} />}
      {screen === 'personal' && <Personal onBack={back} />}
      {screen === 'estimate' && <Estimator onBack={back} />}
      {screen === 'settings' && <Settings onBack={back} />}
      {screen === 'history' && <History onBack={back} onEnterDate={(d) => openDay(d)} />}
      {screen === 'payments' && <Payments onBack={back} />}
      {screen === 'projects' && <ProjectsPage s={state} onBack={back} />}
      {screen === 'workers' && <WorkersPage s={state} onBack={back} />}
      {screen === 'items' && <ItemsPage s={state} onBack={back} />}
      {screen === 'parties' && <PartiesPage s={state} onBack={back} />}
      {screen === 'stages' && <StagesPage s={state} onBack={back} />}
      {screen === 'cash' && <CashPage s={state} onBack={back} />}
      {/* Only once, only on the home screen, and only after setup — a tour
          that opens over a half-finished form is worse than none. */}
      {screen === 'home' && showTour && (
        <Tour stops={HOME_TOUR} onDone={() => { setShowTour(false); void saveSettings({ toured: true }) }} />
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </div>
  )
}
