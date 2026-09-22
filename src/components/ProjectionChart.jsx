import React from 'react'
import { fmt } from '../lib/finance'
import { useElementWidth } from '../lib/ui'

const H = 190
const PAD = { l: 6, r: 6, t: 14, b: 22 }

// Where the cycle is heading. Solid: spent so far. Dashed grey: an
// even pace that lands exactly on budget. Dotted: today's average daily
// spend carried to the end of the cycle -- ending above the budget line
// means "at this rate you'll overspend".
export default function ProjectionChart({ projection }) {
  // Drawn at its real width so labels stay at their real size.
  const [boxRef, W] = useElementWidth()
  if (!projection) return null
  const { days, today, actual, ideal, projected, projectedEnd, budget, diff, perDay } = projection
  const top = Math.max(budget, projectedEnd, actual[actual.length - 1] || 0, 1) * 1.08
  const x = (i) => PAD.l + (i / (days - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)
  const path = (arr) => arr.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean)
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')

  const actualPath = path(actual)
  const areaPath = actual.length > 1 ? `${actualPath} L${x(actual.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z` : ''
  const over = diff < 0
  const tone = over ? 'var(--r5)' : 'var(--e5)'

  return (
    <div className="projection">
      <div className="projection-head">
        <div>
          <div className="projection-kicker">A este ritmo acabarás el ciclo en</div>
          <div className="projection-value" style={{ color: tone }}>{fmt(projectedEnd)}</div>
        </div>
        <div className={`projection-badge ${over ? 'over' : 'under'}`}>
          <i className={`fa ${over ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
          {over ? `${fmt(-diff)} por encima` : `${fmt(diff)} por debajo`}
        </div>
      </div>
      <div ref={boxRef}>
      {W > 0 && <svg width={W} height={H} className="projection-svg" role="img"
        aria-label={`Gastado ${fmt(actual[actual.length - 1] || 0)}; proyección ${fmt(projectedEnd)} frente a ${fmt(budget)} de presupuesto`}>
        <defs>
          <linearGradient id="projArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--i5)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--i5)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(budget)} y2={y(budget)} stroke="var(--g300)" strokeWidth="1" />
        <text x={W - PAD.r} y={y(budget) - 5} textAnchor="end" className="projection-label">Presupuesto {fmt(budget)}</text>
        <path d={path(ideal)} fill="none" stroke="var(--g500)" strokeWidth="1.5" strokeDasharray="5 5" opacity=".7" />
        {areaPath && <path d={areaPath} fill="url(#projArea)" />}
        <path d={path(projected)} fill="none" stroke={tone} strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
        <path d={actualPath} fill="none" stroke="var(--i5)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="projection-actual" />
        <circle cx={x(today)} cy={y(actual[actual.length - 1] || 0)} r="5" fill="var(--i5)" stroke="var(--card)" strokeWidth="2.5" />
        {x(today) - x(0) > 44 && <text x={x(0)} y={H - 5} className="projection-label">Día 1</text>}
        <text x={x(today)} y={H - 5} textAnchor="middle" className="projection-label strong">Hoy</text>
        {x(days - 1) - x(today) > 50 && <text x={x(days - 1)} y={H - 5} textAnchor="end" className="projection-label">Día {days}</text>}
      </svg>}
      </div>
      <div className="projection-legend">
        <span><i className="lg-line solid" /> Gastado</span>
        <span><i className="lg-line dashed" /> Ritmo ideal</span>
        <span><i className="lg-line dotted" style={{ color: tone }} /> Proyección ({fmt(perDay)}/día)</span>
      </div>
    </div>
  )
}
