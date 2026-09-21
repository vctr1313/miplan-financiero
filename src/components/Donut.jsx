import React, { useState } from 'react'
import { fmt } from '../lib/finance'

// Interactive budget ring: hover (or tap) a segment and it lifts out
// while the centre switches from the total to that slice's figures.
// Clicking a slice or its legend row calls onSelect, so the ring
// doubles as a way into each category's detail.
const SIZE = 220
const STROKE = 26
const R = (SIZE - STROKE) / 2 - 6
const GAP_DEG = 2.2

const polar = (cx, cy, r, deg) => {
  const rad = deg * Math.PI / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}
const arc = (cx, cy, r, a0, a1) => {
  const s = polar(cx, cy, r, a0)
  const e = polar(cx, cy, r, a1)
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`
}

export default function Donut({ items, onSelect, centerLabel = 'Total' }) {
  const [active, setActive] = useState(null)
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0)
  const cx = SIZE / 2
  const cy = SIZE / 2

  let cursor = 0
  const segs = items
    .filter(i => i.value > 0)
    .map(i => {
      const sweep = total > 0 ? (i.value / total) * 360 : 0
      const a0 = cursor + GAP_DEG / 2
      const a1 = cursor + Math.max(sweep - GAP_DEG / 2, GAP_DEG / 2 + 0.01)
      cursor += sweep
      const mid = (a0 + a1) / 2
      return { ...i, a0, a1, mid, pct: total > 0 ? i.value / total * 100 : 0 }
    })

  const hovered = segs.find(s => s.id === active)

  return (
    <div className="donut">
      <div className="donut-ring" onMouseLeave={() => setActive(null)}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Distribución del presupuesto">
          {total === 0 && (
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--fill)" strokeWidth={STROKE} />
          )}
          {segs.map((s, idx) => {
            const isActive = s.id === active
            const dim = active && !isActive
            // Pushes the active slice outward along its own bisector.
            const push = polar(0, 0, isActive ? 7 : 0, s.mid)
            return (
              <path
                key={s.id}
                d={arc(cx, cy, R, s.a0, s.a1)}
                fill="none"
                stroke={s.color}
                strokeWidth={isActive ? STROKE + 6 : STROKE}
                strokeLinecap="round"
                className="donut-seg"
                style={{
                  transform: `translate(${push.x}px, ${push.y}px)`,
                  opacity: dim ? 0.35 : 1,
                  animationDelay: `${idx * 45}ms`,
                }}
                onMouseEnter={() => setActive(s.id)}
                onClick={() => { setActive(s.id); onSelect?.(s.item) }}
              />
            )
          })}
        </svg>
        <div className="donut-center">
          {hovered ? (
            <>
              <div className="donut-center-label">{hovered.icon} {hovered.label}</div>
              <div className="donut-center-value">{fmt(hovered.value)}</div>
              <div className="donut-center-sub">{Math.round(hovered.pct * 10) / 10}% del total</div>
            </>
          ) : (
            <>
              <div className="donut-center-label">{centerLabel}</div>
              <div className="donut-center-value">{fmt(total)}</div>
              <div className="donut-center-sub">{segs.length} categorías</div>
            </>
          )}
        </div>
      </div>

      <div className="donut-legend">
        {segs.map(s => (
          <button
            key={s.id}
            type="button"
            className={`donut-legend-row ${s.id === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(s.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(s.id)}
            onBlur={() => setActive(null)}
            onClick={() => onSelect?.(s.item)}
          >
            <span className="donut-dot" style={{ background: s.color }} />
            <span className="donut-legend-name">{s.label}</span>
            <span className="donut-legend-pct">{Math.round(s.pct)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
