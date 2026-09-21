import React, { useMemo, useState } from 'react'
import { fmt } from '../lib/finance'

// A month as a calendar, each day shaded by how much was spent on it.
// Patterns a list can't show jump out here: the Friday-night spikes,
// the quiet stretch before payday, the one day that sank the month.
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function SpendingHeatmap({ transactions, month, year }) {
  const [hover, setHover] = useState(null)

  const { cells, max, total, busiest } = useMemo(() => {
    const byDay = {}
    transactions.forEach(t => {
      if (t.type !== 'expense') return
      const d = new Date(t.date)
      if (d.getMonth() !== month || d.getFullYear() !== year) return
      const day = d.getDate()
      byDay[day] = (byDay[day] || 0) + t.amount
    })
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // Monday-first offset for the first day of the month.
    const lead = (new Date(year, month, 1).getDay() + 6) % 7
    const cells = [
      ...Array.from({ length: lead }, (_, i) => ({ key: `pad-${i}`, pad: true })),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1
        return { key: day, day, amount: byDay[day] || 0 }
      }),
    ]
    const amounts = Object.values(byDay)
    const max = amounts.length ? Math.max(...amounts) : 0
    const total = amounts.reduce((s, v) => s + v, 0)
    const busiestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]
    return { cells, max, total, busiest: busiestDay ? { day: +busiestDay[0], amount: busiestDay[1] } : null }
  }, [transactions, month, year])

  const today = new Date()
  const isThisMonth = today.getMonth() === month && today.getFullYear() === year

  // sqrt keeps a handful of small days visible next to one huge one.
  const level = (amount) => (max > 0 && amount > 0 ? 0.18 + 0.82 * Math.sqrt(amount / max) : 0)

  const shown = hover ?? (busiest ? { day: busiest.day, amount: busiest.amount, busiest: true } : null)

  return (
    <div className="heat">
      <div className="heat-head">
        {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="heat-grid" onMouseLeave={() => setHover(null)}>
        {cells.map((c, i) => c.pad ? (
          <span key={c.key} />
        ) : (
          <button
            key={c.key}
            type="button"
            className={`heat-cell ${level(c.amount) > 0.55 ? 'strong' : ''} ${isThisMonth && c.day === today.getDate() ? 'today' : ''} ${isThisMonth && c.day > today.getDate() ? 'future' : ''}`}
            style={{ '--lvl': level(c.amount), animationDelay: `${i * 12}ms` }}
            onMouseEnter={() => setHover(c)}
            onFocus={() => setHover(c)}
            onClick={() => setHover(c)}
            aria-label={`Día ${c.day}: ${fmt(c.amount)}`}
          >
            {c.day}
          </button>
        ))}
      </div>
      <div className="heat-foot">
        <div className="heat-readout">
          {shown ? (
            <>
              <strong>{shown.busiest ? `Día más caro: ${shown.day}` : `Día ${shown.day}`}</strong>
              <span>{fmt(shown.amount)}</span>
            </>
          ) : <span className="text-muted">Sin gastos este mes</span>}
        </div>
        <div className="heat-scale">
          <span>Menos</span>
          {[0.18, 0.4, 0.62, 0.84, 1].map(l => <i key={l} style={{ '--lvl': l }} />)}
          <span>Más</span>
        </div>
      </div>
      {total > 0 && <div className="heat-total">Total del mes: <strong>{fmt(total)}</strong></div>}
    </div>
  )
}
