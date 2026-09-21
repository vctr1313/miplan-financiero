import React, { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Counts from the previous value to the new one instead of snapping.
// Starts at 0 on mount, so a figure rolls up as the page appears, and
// afterwards animates between real values -- e.g. after adding an
// expense, the balance visibly travels to its new amount rather than
// silently changing while you look elsewhere.
//
// `format` receives the intermediate number, so the caller keeps full
// control of currency/decimals (pass `fmt` from lib/finance).
export default function AnimatedNumber({ value = 0, format = String, duration = 750 }) {
  const target = Number(value) || 0
  const reduced = prefersReducedMotion()
  const [display, setDisplay] = useState(reduced ? target : 0)
  // Mirrors `display` outside of React state. A new target mid-flight
  // must continue from where the number visually IS -- reading the
  // state variable inside the effect would give whatever it was when
  // that effect was created, snapping the count backwards.
  const displayRef = useRef(reduced ? target : 0)
  const frameRef = useRef(null)

  useEffect(() => {
    const from = displayRef.current
    if (from === target) return

    if (prefersReducedMotion()) {
      displayRef.current = target
      setDisplay(target)
      return
    }

    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutQuart: fast off the mark, long soft landing
      const eased = 1 - Math.pow(1 - t, 4)
      const current = t < 1 ? from + (target - from) * eased : target
      displayRef.current = current
      setDisplay(current)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration])

  return <>{format(display)}</>
}
