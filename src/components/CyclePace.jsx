import React from 'react'
import { fmt } from '../lib/finance'
import AnimatedNumber from './AnimatedNumber'

// "Am I doing well this month?" answered in one glance.
//
// A total spent against a budget can't answer it on its own: 60% spent
// is fine on day 20 and alarming on day 5. So the arc shows what's
// been spent while a marker shows where an even pace would have you at
// this point in the cycle, and the figure underneath is the gap
// between the two -- which is the part that actually tells you whether
// to ease off.
const SIZE = 210
const STROKE = 16
const R = (SIZE - STROKE) / 2
// Three-quarter gauge with the gap at the bottom. Angles are compass
// degrees (0 = 12 o'clock, clockwise), so the arc runs from 225
// (bottom-left) up over the top to 135 (bottom-right).
const START = 225
const SWEEP = 270

const polar = (cx, cy, r, deg) => {
  const rad = deg * Math.PI / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

const arcPath = (cx, cy, r, startDeg, sweepDeg) => {
  const start = polar(cx, cy, r, startDeg)
  const end = polar(cx, cy, r, startDeg + sweepDeg)
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${end.x} ${end.y}`
}

export default function CyclePace({ cycle, spent, budget }) {
  const cx = SIZE / 2
  const cy = SIZE / 2

  const now = Date.now()
  const start = cycle ? cycle.start.getTime() : now
  // A cycle's `end` is "now" while it's still open, which would make
  // elapsed always 100%. Assume a ~30 day cycle in that case so the
  // pace marker means something mid-month.
  const assumedEnd = cycle ? start + 30 * 86400000 : now
  const totalMs = Math.max(assumedEnd - start, 86400000)
  const elapsed = Math.min(1, Math.max(0, (now - start) / totalMs))

  const dayOf = Math.floor((now - start) / 86400000) + 1
  const totalDays = Math.round(totalMs / 86400000)
  const daysLeft = Math.max(0, totalDays - dayOf)

  const ratio = budget > 0 ? spent / budget : 0
  const shown = Math.min(1, Math.max(0, ratio))

  // Where an even daily spend would have you by now, and how far off
  // that you actually are.
  const expected = budget * elapsed
  const gap = expected - spent          // positive = under pace
  const projected = elapsed > 0.02 ? spent / elapsed : spent

  const over = budget > 0 && spent > budget
  const behindPace = gap < 0
  const color = over ? 'var(--r5)' : behindPace ? 'var(--a5)' : 'var(--e5)'

  const circumference = 2 * Math.PI * R
  const arcLen = circumference * (SWEEP / 360)
  const marker = polar(cx, cy, R, START + SWEEP * elapsed)

  return (
    <div className="pace">
      <div className="pace-dial">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
          aria-label={`Gastado ${fmt(spent)} de ${fmt(budget)}`}>
          <path d={arcPath(cx, cy, R, START, SWEEP)} fill="none" stroke="var(--fill)"
            strokeWidth={STROKE} strokeLinecap="round" />
          <path
            d={arcPath(cx, cy, R, START, SWEEP)} fill="none" stroke={color}
            strokeWidth={STROKE} strokeLinecap="round"
            // The dash is drawn from the START of the path, so its
            // length alone is the filled share -- no offset needed.
            strokeDasharray={`${arcLen * shown} ${circumference}`}
            className="pace-arc"
          />
          {/* Where you'd be spending evenly across the cycle. */}
          {budget > 0 && (
            <circle cx={marker.x} cy={marker.y} r={4.5} fill="var(--card)"
              stroke="var(--g500)" strokeWidth={2.5} />
          )}
        </svg>

        <div className="pace-center">
          <div className="pace-spent"><AnimatedNumber value={spent} format={fmt} /></div>
          <div className="pace-of">de {fmt(budget)}</div>
        </div>
      </div>

      <div className="pace-side">
        <div className="pace-headline" style={{ color }}>
          {budget <= 0
            ? 'Sin presupuesto definido'
            : over
              ? `Te has pasado ${fmt(spent - budget)}`
              : behindPace
                ? `${fmt(-gap)} por encima del ritmo`
                : `${fmt(gap)} por debajo del ritmo`}
        </div>
        <div className="pace-sub">
          {cycle ? <>Día {Math.max(1, dayOf)} de {totalDays} · quedan {daysLeft} días</> : 'Sin nómina registrada'}
        </div>

        <div className="pace-facts">
          <div>
            <span>A este ritmo</span>
            <strong style={{ color: projected > budget && budget > 0 ? 'var(--r5)' : 'var(--text)' }}>
              {fmt(projected)}
            </strong>
          </div>
          <div>
            <span>Disponible</span>
            <strong>{fmt(Math.max(0, budget - spent))}</strong>
          </div>
          <div>
            <span>Al día</span>
            <strong>{daysLeft > 0 ? fmt(Math.max(0, budget - spent) / daysLeft) : '—'}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
