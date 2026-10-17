import { Component, type ReactNode } from 'react'
import { getState } from '../lib/store'
import { telHref } from '../lib/phone'
import { t, tf } from '../lib/i18n'

/* When something breaks, he must never be left looking at a blank screen
   wondering whether his book is gone. It is not: every row is in the phone's
   own storage the moment it is written. So the screen says that, offers to
   open the app again, and names the person to ring. */
export function CrashScreen() {
  let name = ''
  let phone = ''
  try { const st = getState().settings; name = st.helper_name.trim(); phone = st.helper_phone } catch { /* settings not loaded */ }
  const tel = telHref(phone)
  return (
    <div className="app">
      <div className="scroll" style={{ paddingTop: '4rem' }}>
        <h2 className="question">{t('কিছু একটা গোলমাল হয়েছে। আপনার লেখা হিসাব হারায়নি।')}</h2>
        <button className="btn primary" style={{ width: '100%', marginTop: '1.4rem' }} onClick={() => location.reload()}>{t('আবার খুলুন')}</button>
        {tel && (
          <a className="btn ghost" href={tel} style={{ display: 'block', width: '100%', marginTop: '.8rem', textAlign: 'center', textDecoration: 'none' }}>
            {tf('{0} কে ফোন করুন', name || t('সাহায্যকারী'))}
          </a>
        )}
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <CrashScreen /> : this.props.children }
}

/* Lets the checks open the crash screen on purpose: `#crash-test`, and only on the development server —
   a release build compiles this away. */
export function CrashTest() {
  if (import.meta.env.DEV && location.hash === '#crash-test') throw new Error('crash test')
  return null
}
