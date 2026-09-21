import React from 'react'
import { fmt } from '../lib/finance'

// Apple Watch-style concentric rings, one per money "stream" of the
// cycle. Past 100% a ring keeps going for a second lap in a darker
// shade (as the Watch does), so overshooting stays visible rather than
// just pinning at full.
const SIZE = 150
const STROKE = 15
const GAP = 3

export default function ActivityRings({ rings }) {
  const c = SIZE / 2
  return (
    <div className="rings">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={rings.map(r => `${r.label}: ${Math.round(ratio(r) * 100)}%`).join(', ')}>
        {rings.map((r, i) => {
          const radius = c - STROKE / 2 - i * (STROKE + GAP)
          const circ = 2 * Math.PI * radius
          const p = ratio(r)
          const first = Math.min(1, p)
          const lap = Math.min(1, Math.max(0, p - 1))
          return (
            <g key={r.label} transform={`rotate(-90 ${c} ${c})`}>
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity=".18" strokeWidth={STROKE} />
              <circle
                cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${circ * first} ${circ}`}
                className="ring-arc" style={{ animationDelay: `${i * 120}ms` }}
              />
              {lap > 0 && (
                <circle
                  cx={c} cy={c} r={radius} fill="none" strokeWidth={STROKE} strokeLinecap="round"
                  stroke={r.color} style={{ filter: 'brightness(.72)', animationDelay: `${i * 120 + 500}ms` }}
                  strokeDasharray={`${circ * lap} ${circ}`}
                  className="ring-arc"
                />
              )}
            </g>
          )
        })}
      </svg>
      <div className="rings-legend">
        {rings.map(r => {
          const p = ratio(r)
          return (
            <div key={r.label} className="rings-row">
              <span className="rings-dot" style={{ background: r.color }} />
              <div className="rings-text">
                <span>{r.label}</span>
                <strong className={p > 1 ? 'over' : ''}>
                  {r.max > 0 ? `${Math.round(p * 100)}%` : '—'}
                </strong>
                <small>{fmt(r.value)} de {fmt(r.max)}</small>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ratio(r) {
  return r.max > 0 ? Math.max(0, r.value / r.max) : 0
}
