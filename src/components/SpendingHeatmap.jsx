import React, { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { fmt, toLocalISODate } from '../lib/finance'

// A period (a salary cycle or a month) laid out as a calendar, each
// day shaded by how much was spent on it. Patterns a list can't show
// jump out here: the Friday-night spikes, the quiet stretch before
// payday, the one day that sank the month.
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function SpendingHeatmap({ transactions, start, end }) {
  const [hover, setHover] = useState(null)
  const todayKey = toLocalISODate(new Date())

  const { cells, max, total, busiest } = useMemo(() => {
    const first = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    const byDay = {}
    transactions.forEach(t => {
      if (t.type !== 'expense') return
      const d = parseISO(t.date)
      if (d < first || d > last) return
      byDay[t.date] = (byDay[t.date] || 0) + t.amount
    })

    // Monday-first offset for the first day shown.
    const lead = (first.getDay() + 6) % 7
    const days = []
    // Stepping by calendar day (not +86400000ms) keeps DST changes from
    // skipping or repeating a date.
    for (let d = new Date(first); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const key = toLocalISODate(d)
      days.push({ key, date: d, day: d.getDate(), amount: byDay[key] || 0 })
      if (days.length > 62) break // guard against a malformed range
    }
    const cells = [
      ...Array.from({ length: lead }, (_, i) => ({ key: `pad-${i}`, pad: true })),
      ...days,
    ]
    const amounts = Object.values(byDay)
    const max = amounts.length ? Math.max(...amounts) : 0
    const total = amounts.reduce((s, v) => s + v, 0)
    const top = days.reduce((best, c) => (c.amount > (best?.amount || 0) ? c : best), null)
    return { cells, max, total, busiest: top }
  }, [transactions, start, end])

  // sqrt keeps a handful of small days visible next to one huge one.
  const level = (amount) => (max > 0 && amount > 0 ? 0.18 + 0.82 * Math.sqrt(amount / max) : 0)
  const dateLabel = (c) => c.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  const shown = hover || (busiest ? { ...busiest, busiest: true } : null)

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
            className={[
              'heat-cell',
              level(c.amount) > 0.55 ? 'strong' : '',
              c.key === todayKey ? 'today' : '',
              c.key > todayKey ? 'future' : '',
            ].join(' ')}
            style={{ '--lvl': level(c.amount), animationDelay: `${i * 12}ms` }}
            onMouseEnter={() => setHover(c)}
            onFocus={() => setHover(c)}
            onClick={() => setHover(c)}
            aria-label={`${dateLabel(c)}: ${fmt(c.amount)}`}
          >
            {c.day}
            {/* Mark where a new month starts inside a cycle. */}
            {c.day === 1 && i > 0 && (
              <small className="heat-month">{c.date.toLocaleDateString('es-ES', { month: 'short' })}</small>
            )}
          </button>
        ))}
      </div>
      <div className="heat-foot">
        <div className="heat-readout">
          {shown ? (
            <>
              <strong>{shown.busiest ? `Día más caro: ${dateLabel(shown)}` : dateLabel(shown)}</strong>
              <span>{fmt(shown.amount)}</span>
            </>
          ) : <span className="text-muted">Sin gastos en este periodo</span>}
        </div>
        <div className="heat-scale">
          <span>Menos</span>
          {[0.18, 0.4, 0.62, 0.84, 1].map(l => <i key={l} style={{ '--lvl': l }} />)}
          <span>Más</span>
        </div>
      </div>
      {total > 0 && <div className="heat-total">Total del periodo: <strong>{fmt(total)}</strong></div>}
    </div>
  )
}
