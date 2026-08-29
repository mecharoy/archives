import { useEffect, useState, useCallback } from 'react'
import { Home } from './screens/Home'
import { DayWizard } from './screens/DayWizard'
import { Shop } from './screens/Shop'
import { Personal } from './screens/Personal'
import { Estimator } from './screens/Estimator'
import { Settings } from './screens/Settings'
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

type Screen = 'home' | 'day' | 'shop' | 'personal' | 'estimate' | 'settings' | 'history' | 'payments'

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
    target: 'tabs',
    title: 'তিনটে খাতা',
    body: 'কাজ — সাইটের হিসাব। মজুত — দোকানের মাল। হিসাব — টাকা, বাকি, পাওনা আর নিজের খরচ। যেটা দরকার সেটায় চাপুন।',
    place: 'below',
  },
  {
    target: 'standing',
    title: 'নিচে সব সময় তিনটে সংখ্যা',
    body: 'হাতে কত আছে, কত পাবেন, কত দেবেন — যে পাতাতেই থাকুন, নিচে এই তিনটে দেখা যাবে। চাপলে কে কত, তার তালিকা খুলবে।',
    place: 'above',
  },
  {
    target: 'settings',
    title: 'এখানে সব কিছু বদলানো যায়',
    body: 'ভাষা (বাংলা বা English), লেখার আকার, টাকার তাগাদা, লোকজন আর দোকানের নাম — সব এই চাকাটার ভিতরে।',
    place: 'below',
  },
]

export function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const needsSetup = useStore((s) => s.ready && !s.settings.onboarded && activeProjects(s).length === 0 && allWorkers(s).length === 0)
  const [screen, setScreen] = useState<Screen>('home')
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
    if (screen !== 'home') setScreen('home')
  }, [settings.toured]) // eslint-disable-line

  useEffect(() => { startSyncLoop() }, [])

  /* Reminders are rebuilt whenever the ledger changes — a bill paid this
     evening must not nag him tomorrow morning. Cheap: it cancels ours and
     schedules what the current dues say. */
  const entryCount = useStore((s) => s.entries.length)
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

  const goHome = useCallback(() => { setScreen('home'); setDraft(null) }, [])

  /* Android's back button must behave like the back arrow, not like a way to
     lose half an entry. */
  useEffect(() => {
    let remove: (() => void) | undefined
    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app')
        const h = await CapApp.addListener('backButton', () => {
          /* Innermost first: a sheet, a wizard step, a settings sub-page.
             Only when nothing claims the press does it mean "leave this
             screen", and only from home does it mean "leave the app". */
          if (goBack()) return
          if (screen !== 'home') goHome()
          else void CapApp.exitApp()
        })
        remove = () => void h.remove()
      } catch { /* browser */ }
    })()
    return () => remove?.()
  }, [screen, goHome])

  if (!ready) return <div className="app" />

  if (needsSetup) {
    return (
      <div className="app">
        <Onboarding onDone={() => toast.show('শুরু হল — এবার আজকের হিসাব লিখুন')} />
        {toast.msg && <Toast text={toast.msg} />}
      </div>
    )
  }

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          onDay={() => { setDraft(null); setScreen('day') }}
          onSameAsYesterday={(d) => { setDraft(d); setScreen('day') }}
          onGo={(s) => setScreen(s === 'project' ? 'settings' : s)}
        />
      )}
      {screen === 'day' && (
        <DayWizard start={draft} onExit={(saved) => { goHome(); if (saved) toast.show('আজকের হিসাব লেখা হল') }} />
      )}
      {screen === 'shop' && <Shop onBack={goHome} />}
      {screen === 'personal' && <Personal onBack={goHome} />}
      {screen === 'estimate' && <Estimator onBack={goHome} />}
      {screen === 'settings' && <Settings onBack={goHome} />}
      {screen === 'history' && <History onBack={goHome} onEnterDate={(d) => { setDraft(d); setScreen('day') }} />}
      {screen === 'payments' && <Payments onBack={goHome} />}
      {/* Only once, only on the home screen, and only after setup — a tour
          that opens over a half-finished form is worse than none. */}
      {screen === 'home' && showTour && (
        <Tour stops={HOME_TOUR} onDone={() => { setShowTour(false); void saveSettings({ toured: true }) }} />
      )}
      {toast.msg && <Toast text={toast.msg} />}
    </div>
  )
}
