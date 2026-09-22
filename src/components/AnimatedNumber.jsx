import React, { useEffect, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// An odometer: each digit is a vertical strip of 0-9 that rolls to
// its new value, so a changing figure visibly ticks over (like an
// iOS timer) instead of snapping. It first renders with every digit
// at 0 and rolls up as the page appears.
//
// `format` turns the number into the displayed text (pass `fmt` from
// lib/finance); only the digits roll, separators and symbols stay put.
// Digits are keyed from the RIGHT, so 999 € -> 1.000 € keeps the units
// column in place and just adds columns on the left.
export default function AnimatedNumber({ value = 0, format = String }) {
  const text = format(Number(value) || 0)
  const [shown, setShown] = useState(() => prefersReducedMotion() ? text : text.replace(/\d/g, '0'))

  useEffect(() => {
    // Next frame, so the zeroed first render is painted and the
    // strips have somewhere to roll from.
    const id = requestAnimationFrame(() => setShown(text))
    return () => cancelAnimationFrame(id)
  }, [text])

  const chars = shown.split('')
  return (
    <span className="odo">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {chars.map((c, i) => {
          const pos = chars.length - i
          if (!/\d/.test(c)) return <span key={`c${pos}`} className="odo-char">{c}</span>
          return (
            <span key={`d${pos}`} className="odo-digit">
              <span className="odo-strip" style={{ transform: `translateY(${-Number(c) * 10}%)`, transitionDelay: `${pos * 25}ms` }}>
                {DIGITS.map(d => <span key={d}>{d}</span>)}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
