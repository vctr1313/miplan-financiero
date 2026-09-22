import React, { useMemo, useState } from 'react'
import { monthCalendar } from '../lib/insights'
import { fmt, fmtShort, monthLabel } from '../lib/finance'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// The month at a glance: what went out each day (the deeper the tint,
// the bigger the day), money in, and the fixed charges still to come.
// Tapping a day hands its date to `onPickDay` (the list then filters to
// it).
export default function MonthCalendar({ transactions, fixedExpenses, onPickDay, selected }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const cal = useMemo(
    () => monthCalendar({ year: ym.y, month: ym.m, transactions, fixedExpenses }),
    [ym, transactions, fixedExpenses]
  )
  const shift = (d) => setYm(({ y, m }) => {
    const t = new Date(y, m + d, 1)
    return { y: t.getFullYear(), m: t.getMonth() }
  })
  const monthTotal = cal.weeks.flat().filter(Boolean).reduce((s, c) => s + c.spent, 0)
  const upcoming = cal.weeks.flat().filter(c => c && c.fixed.length).flatMap(c => c.fixed.map(f => ({ ...f, day: c.day })))

  return (
    <div className="mcal">
      <div className="mcal-head">
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => shift(-1)} aria-label="Mes anterior"><i className="fa fa-chevron-left" /></button>
        <div className="mcal-title">
          <strong>{monthLabel(new Date(ym.y, ym.m, 1))}</strong>
          <span>{fmt(monthTotal)} gastados</span>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => shift(1)} aria-label="Mes siguiente"><i className="fa fa-chevron-right" /></button>
      </div>
      <div className="mcal-grid" role="grid">
        {WEEKDAYS.map(d => <div key={d} className="mcal-wd" role="columnheader">{d}</div>)}
        {cal.weeks.flat().map((c, i) => {
          if (!c) return <div key={`e${i}`} className="mcal-cell empty" />
          const heat = cal.maxSpent > 0 ? Math.max(0, c.spent) / cal.maxSpent : 0
          return (
            <button key={c.iso} type="button" role="gridcell"
              className={`mcal-cell ${c.isToday ? 'today' : ''} ${c.isFuture ? 'future' : ''} ${selected === c.iso ? 'selected' : ''}`}
              style={{ '--heat': heat }}
              onClick={() => onPickDay?.(selected === c.iso ? null : c.iso)}
              aria-label={`${c.day}: ${c.spent > 0 ? fmt(c.spent) + ' gastados' : 'sin gastos'}${c.income ? ', ingresos ' + fmt(c.income) : ''}${c.fixed.length ? ', ' + c.fixed.length + ' cargo fijo previsto' : ''}`}>
              <span className="mcal-day">{c.day}</span>
              {c.spent > 0.005 && <span className="mcal-amt">{fmtShort(c.spent)}</span>}
              <span className="mcal-dots">
                {c.income > 0 && <i className="dot in" />}
                {c.fixed.length > 0 && <i className="dot fx" />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mcal-legend">
        <span><i className="dot in" /> Ingreso</span>
        <span><i className="dot fx" /> Cargo fijo previsto</span>
      </div>
      {upcoming.length > 0 && (
        <div className="mcal-upcoming">
          <div className="text-xs text-muted mb-1">Próximos cargos fijos</div>
          {upcoming.map(f => (
            <div key={f.id} className="mcal-up-row">
              <span>{f.icon || '📌'} {f.name}</span>
              <span className="text-muted">día {f.day}</span>
              <strong>{fmt(f.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
