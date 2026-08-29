import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { boot } from './lib/store'

boot().then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
  void (async () => {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen')
      await SplashScreen.hide()
    } catch { /* browser */ }
  })()
})
