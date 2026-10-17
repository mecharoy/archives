import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { boot } from './lib/store'
import { ErrorBoundary, CrashScreen, CrashTest } from './ui/Crash'

const root = createRoot(document.getElementById('root')!)

/* A failure while starting (storage refused, a bad saved file) or while drawing shows the crash screen,
   never a blank page. */
boot()
  .then(() => {
    root.render(<StrictMode><ErrorBoundary><CrashTest /><App /></ErrorBoundary></StrictMode>)
  })
  .catch(() => {
    root.render(<CrashScreen />)
  })
  .finally(() => {
    void (async () => {
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide()
      } catch { /* browser */ }
    })()
  })
