import React, { useEffect, useRef, useState } from 'react'
import { fmt } from '../lib/finance'

const NODE = 12
const GAP = 8

// Where each nómina goes, as a flow diagram: the salary on the left
// splits into bands whose thickness is the amount. Tapping a group on
// the right drills into it (e.g. Día a día -> Ocio, Comida…).
export default function SalaryFlow({ flow, height = 280 }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  const [openId, setOpenId] = useState(null)
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

  if (!flow) return null
  const open = openId && flow.groups.find(g => g.id === openId && g.children.length)
  const source = open
    ? { label: open.label, value: open.value, color: open.color }
    : { label: 'Nómina', value: flow.salary, color: 'var(--i5)' }
  const targets = open ? open.children : flow.groups
  const total = targets.reduce((s, t) => s + t.value, 0) || 1

  // Right column: one node per target, heights proportional, with gaps.
  const usable = height - GAP * (targets.length - 1)
  let yy = 0
  const nodes = targets.map(t => {
    const h = Math.max(3, (t.value / total) * usable)
    const n = { ...t, y: yy, h }
    yy += h + GAP
    return n
  })
  const rightX = Math.max(120, width * 0.4)
  // Left node: bands leave it stacked without gaps.
  let ly = 0
  const bands = nodes.map(n => {
    const h = (n.value / total) * height
    const b = { n, y0: ly, y1: ly + h }
    ly += h
    return b
  })
  const cx = NODE + (rightX - NODE) / 2
  const band = ({ n, y0, y1 }) =>
    `M${NODE} ${y0} C${cx} ${y0} ${cx} ${n.y} ${rightX} ${n.y} L${rightX} ${n.y + n.h} C${cx} ${n.y + n.h} ${cx} ${y1} ${NODE} ${y1} Z`

  return (
    <div className="salary-flow">
      <div className="sf-head">
        {open
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}><i className="fa fa-chevron-left" /> Toda la nómina</button>
          : <span className="text-xs text-muted">Toca un grupo para ver sus categorías</span>}
        <strong>{source.label} · {fmt(source.value)}</strong>
      </div>
      <div ref={ref} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} key={open ? open.id : 'root'} className="sf-svg">
            <rect x="0" y="0" width={NODE} height={height} rx="4" fill={source.color} />
            {bands.map((b, i) => (
              <path key={b.n.id} d={band(b)} fill={b.n.color || '#8e8e93'} className="sf-band" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
            {nodes.map(n => {
              const clickable = !open && n.children?.length > 0
              return (
                <g key={n.id} className={clickable ? 'sf-node click' : 'sf-node'} onClick={clickable ? () => setOpenId(n.id) : undefined}
                  role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                  onKeyDown={clickable ? (e => (e.key === 'Enter' || e.key === ' ') && setOpenId(n.id)) : undefined}>
                  <rect x={rightX} y={n.y} width={NODE} height={n.h} rx="3" fill={n.color || '#8e8e93'} />
                  {n.h >= 13 && (
                    <text x={rightX + NODE + 8} y={n.y + n.h / 2} dominantBaseline="central" className="sf-label">
                      {n.icon ? `${n.icon} ` : ''}{n.label}
                      <tspan className="sf-value"> {fmt(n.value)} · {Math.round(n.value / source.value * 100)} %</tspan>
                      {clickable && <tspan className="sf-chev"> ›</tspan>}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      {!open && flow.over > 0 && (
        <div className="alert alert-warning mt-2" style={{ marginBottom: 0 }}>
          <i className="fa fa-triangle-exclamation" /> Tienes asignado {fmt(flow.over)} más de lo que cobras.
        </div>
      )}
    </div>
  )
}
