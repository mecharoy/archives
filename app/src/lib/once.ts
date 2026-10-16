import { useRef } from 'react'

/* Two quick taps on a save button used to write the row twice: the second tap landed before the first
   write had finished and changed anything on screen. This lets one call through and ignores the others
   until it is done (and for a moment after, because the screen is still on its way out). */
export function useOnce<A extends unknown[]>(fn: (...a: A) => Promise<unknown> | void) {
  const busy = useRef(false)
  const latest = useRef(fn)
  latest.current = fn
  return async (...a: A) => {
    if (busy.current) return
    busy.current = true
    try { await latest.current(...a) } finally { setTimeout(() => { busy.current = false }, 700) }
  }
}
