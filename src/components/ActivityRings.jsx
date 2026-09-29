import React from 'react'
import { fmt } from '../lib/finance'
import { ringState } from '../lib/insights'

// Apple Watch-style concentric rings, one per money "stream" of the
// cycle -- but running the other way round: each ring starts FULL (the
// money is untouched) and empties as it's spent, so a full ring is the
// good state and an empty one means it's all gone. Overspending draws
// the excess back over the track in red.
//
// Each ring is { label, color, left, total, hint }.
const SIZE = 150
const STROKE = 15
const GAP = 3

export default function ActivityRings({ rings }) {
  const c = SIZE / 2
  const states = rings.map(r => ({ ...r, ...ringState(r) }))
  return (
    <div className="rings">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={states.map(r => `${r.label}: ${r.over ? `pasado ${fmt(-r.left)}` : `quedan ${fmt(r.left)} de ${fmt(r.total)}`}`).join('; ')}>
        {states.map((r, i) => {
          const radius = c - STROKE / 2 - i * (STROKE + GAP)
          const circ = 2 * Math.PI * radius
          return (
            <g key={r.label} transform={`rotate(-90 ${c} ${c})`}>
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity=".18" strokeWidth={STROKE} />
              {r.ratio > 0 && (
                <circle
                  cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${circ * r.ratio} ${circ}`}
                  className="ring-arc" style={{ animationDelay: `${i * 120}ms` }}
                />
              )}
              {r.overRatio > 0 && (
                <circle
                  cx={c} cy={c} r={radius} fill="none" stroke="var(--r5)" strokeWidth={STROKE} strokeLinecap="round"
                  strokeDasharray={`${circ * r.overRatio} ${circ}`}
                  className="ring-arc ring-over" style={{ animationDelay: `${i * 120 + 300}ms` }}
                />
              )}
            </g>
          )
        })}
      </svg>
      <div className="rings-legend">
        {states.map(r => (
          <div key={r.label} className="rings-row">
            <span className="rings-dot" style={{ background: r.over ? 'var(--r5)' : r.color }} />
            <div className="rings-text">
              <span>{r.label}</span>
              <strong className={r.over ? 'over' : ''}>
                {r.over ? `−${fmt(-r.left)}` : fmt(r.left)}
              </strong>
              <small>{r.over ? (r.hint || 'te has pasado') : `de ${fmt(r.total)} · ${Math.round(r.ratio * 100)} %`}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
