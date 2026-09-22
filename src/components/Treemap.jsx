import React, { useEffect, useRef, useState } from 'react'
import { squarify } from '../lib/insights'
import { fmt } from '../lib/finance'

// Where the money went, as areas: each rectangle is a category, sized
// by what was spent in it. Big blocks jump out in a way a list doesn't.
export default function Treemap({ items, height = 240 }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (!('ResizeObserver' in window)) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = items.reduce((s, i) => s + i.value, 0)
  const rects = width ? squarify(items, width, height) : []
  return (
    <div ref={ref} className="treemap" style={{ height }} role="list" aria-label="Gasto por categoría">
      {rects.map((r, i) => {
        const small = r.w < 70 || r.h < 44
        return (
          <div key={r.id} role="listitem" className={`tm-cell ${small ? 'small' : ''}`}
            title={`${r.label}: ${fmt(r.value)} (${Math.round(r.value / total * 100)} %)`}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, '--c': r.color || '#8e8e93', animationDelay: `${i * 40}ms` }}>
            <div className="tm-inner">
              <span className="tm-icon">{r.icon}</span>
              {!small && <span className="tm-label">{r.label}</span>}
              {!small && <span className="tm-value">{fmt(r.value)} · {Math.round(r.value / total * 100)} %</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
