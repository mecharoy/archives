/* Where the Android back button goes.

   It used to go straight to the home screen from anywhere, which is wrong
   everywhere it is used: back out of a sheet and the sheet should close; back
   out of সেটিংস → লোকজন and you should land on সেটিংস, not on the home
   screen with your place lost.

   So screens register what "back" means while they are showing, newest first.
   The app shell asks the top of the stack; only when nothing has registered
   does it fall through to going home, and only from home does it leave the
   app. A screen that registers nothing behaves exactly as before.

   The stack is module state rather than context on purpose: the Capacitor
   listener that reads it lives outside React's tree, and a ref-free read is
   the only way it can be right at the moment the button is pressed. */

import { useEffect, useRef } from 'react'

interface Handler { id: number; fn: () => void }

const stack: Handler[] = []
let nextId = 1

export function pushBack(fn: () => void): number {
  const id = nextId++
  stack.push({ id, fn })
  return id
}

export function popBack(id: number): void {
  const i = stack.findIndex((h) => h.id === id)
  if (i >= 0) stack.splice(i, 1)
}

/** Run the innermost handler. False means nothing claimed the press. */
export function goBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.fn()
  return true
}

export function backDepth(): number { return stack.length }

/**
 * Claim the back button while `active`.
 * The handler is read fresh on every press, so it always closes over current
 * state — registering once and calling a stale closure is the bug this
 * avoids.
 */
export function useBackHandler(fn: () => void, active = true): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return
    const id = pushBack(() => ref.current())
    return () => popBack(id)
  }, [active])
}
