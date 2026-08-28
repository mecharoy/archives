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
import { useStore, activeProjects, allWorkers } from './lib/store'
import { startSyncLoop } from './lib/sync'
import { reschedule } from './lib/remind'
import { useToast, Toast } from './ui/kit'
import type { Draft } from './lib/draft'

type Screen = 'home' | 'day' | 'shop' | 'personal' | 'estimate' | 'settings' | 'history' | 'payments'

export function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const needsSetup = useStore((s) => s.ready && !s.settings.onboarded && activeProjects(s).length === 0 && allWorkers(s).length === 0)
  const [screen, setScreen] = useState<Screen>('home')
  const [draft, setDraft] = useState<Draft | null>(null)
  const toast = useToast()

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
      {toast.msg && <Toast text={toast.msg} />}
    </div>
  )
}
