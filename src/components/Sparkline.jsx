import React from 'react'

// A word-sized line chart: how a category's spending built up over the
// cycle so far. Flat stretches are days with no spending; a jump is a
// big purchase. `max` (e.g. the budget) fixes the vertical scale, so a
// line touching the top means the budget is used up.
export default function Sparkline({ values, color = 'var(--i5)', max, width = 64, height = 22, label }) {
  if (!values || values.length < 2) return null
  const top = Math.max(max || 0, ...values, 1)
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - (Math.max(0, v) / top) * (height - 4),
  ])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={area} fill={color} opacity=".14" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.2" fill={color} />
    </svg>
  )
}
