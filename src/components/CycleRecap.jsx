import React, { useEffect, useMemo } from 'react'
import { useApp } from '../App'
import { fmt, calcCycleStats, catBudget, calcSavingsRate } from '../lib/finance'
import { burstConfetti } from '../lib/confetti'

const dateFmt = { day: 'numeric', month: 'short' }

// "How did that cycle go?" -- shown once when a new nómina closes the
// previous cycle (see lib/recap.js), and on demand from the history.
export function summarizeCycle({ cycle, prevCycle, transactions, categories, fixedExpenses, pctHistory, salary }) {
  const stats = calcCycleStats({ transactions, cycle, categories, salary, fixedExpenses })
  const prev = prevCycle ? calcCycleStats({ transactions, cycle: prevCycle, categories, salary, fixedExpenses }) : null
  const rate = calcSavingsRate(stats.income, stats.netExpenses)

  const rows = categories
    .filter(c => c.type !== 'saving')
    .map(c => {
      const budget = catBudget(c, salary, pctHistory, cycle.end)
      const spent = stats.spendByCat[c.id] || 0
      return { c, budget, spent, diff: budget - spent }
    })
    .filter(r => r.budget > 0 || r.spent > 0)

  const over = rows.filter(r => r.diff < 0).sort((a, b) => a.diff - b.diff)
  const under = rows.filter(r => r.diff > 0 && r.spent > 0).sort((a, b) => b.diff - a.diff)
  const budgetTotal = rows.reduce((s, r) => s + r.budget, 0)

  return {
    stats, rate, over, under, budgetTotal,
    expenseDelta: prev ? stats.netExpenses - prev.netExpenses : null,
    prevExpenses: prev?.netExpenses ?? null,
    goodCycle: stats.netExpenses <= budgetTotal && stats.balance >= 0,
  }
}

export default function CycleRecap({ cycle, prevCycle, onClose, celebrate = false }) {
  const { profile, transactions, categories, fixedExpenses, pctHistory } = useApp()
  const salary = profile?.salary || 0

  const s = useMemo(
    () => summarizeCycle({ cycle, prevCycle, transactions, categories, fixedExpenses, pctHistory, salary }),
    [cycle, prevCycle, transactions, categories, fixedExpenses, pctHistory, salary]
  )

  useEffect(() => {
    if (celebrate && s.goodCycle) {
      const t = setTimeout(() => burstConfetti({ y: 0.3, count: 90 }), 450)
      return () => clearTimeout(t)
    }
  }, [celebrate, s.goodCycle])

  const range = `${cycle.start.toLocaleDateString('es-ES', dateFmt)} – ${cycle.end.toLocaleDateString('es-ES', dateFmt)}`

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal recap" style={{ maxWidth: 520 }}>
        <div className="recap-hero">
          <div className="recap-kicker">Ciclo cerrado · {range}</div>
          <h3 className="recap-title">
            {s.goodCycle ? 'Buen ciclo' : s.stats.balance < 0 ? 'Ciclo en negativo' : 'Ciclo algo por encima'}
          </h3>
          <div className="recap-big" style={{ color: s.stats.balance >= 0 ? 'var(--e6)' : 'var(--r5)' }}>
            {s.stats.balance >= 0 ? '+' : ''}{fmt(s.stats.balance)}
          </div>
          <div className="recap-sub">
            de balance · ahorraste el <strong>{s.rate.toFixed(0)}%</strong> de lo que entró
          </div>
        </div>

        <div className="recap-grid">
          <div><span>Ingresos</span><strong>{fmt(s.stats.income)}</strong></div>
          <div><span>Gastado</span><strong>{fmt(s.stats.netExpenses)}</strong></div>
          <div>
            <span>Vs ciclo anterior</span>
            <strong style={{ color: s.expenseDelta == null ? 'var(--muted)' : s.expenseDelta > 0 ? 'var(--r5)' : 'var(--e6)' }}>
              {s.expenseDelta == null ? '—' : `${s.expenseDelta > 0 ? '+' : ''}${fmt(s.expenseDelta)}`}
            </strong>
          </div>
        </div>

        {s.over.length > 0 && (
          <div className="recap-section">
            <div className="recap-section-title"><i className="fa fa-triangle-exclamation" style={{ color: 'var(--r5)' }} /> Te pasaste en</div>
            {s.over.slice(0, 4).map(r => (
              <div key={r.c.id} className="recap-row">
                <span className="recap-ico" style={{ background: r.c.color + '22' }}>{r.c.icon}</span>
                <span className="recap-name">{r.c.name}</span>
                <span className="recap-val" style={{ color: 'var(--r5)' }}>+{fmt(-r.diff)}</span>
              </div>
            ))}
          </div>
        )}

        {s.under.length > 0 && (
          <div className="recap-section">
            <div className="recap-section-title"><i className="fa fa-circle-check" style={{ color: 'var(--e5)' }} /> Te sobró en</div>
            {s.under.slice(0, 4).map(r => (
              <div key={r.c.id} className="recap-row">
                <span className="recap-ico" style={{ background: r.c.color + '22' }}>{r.c.icon}</span>
                <span className="recap-name">{r.c.name}{r.c.type === 'pot' ? <small> · se acumula en el bote</small> : null}</span>
                <span className="recap-val" style={{ color: 'var(--e6)' }}>{fmt(r.diff)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            {celebrate
              ? <><i className="fa fa-arrow-right" /> Empezar el nuevo ciclo</>
              : 'Cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
