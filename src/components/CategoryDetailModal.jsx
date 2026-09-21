import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { fmt, catBudget, getTxInCycle, getIncludedCycles, isPotAffectingTx, potTxDelta, getPctAtDate } from '../lib/finance'

// 'normal' categories reset every cycle: the ledger is scoped to one
// cycle at a time (navigable), running total starts at that cycle's
// own historical budget and counts down as expenses land -- e.g.
// 100€ budget, -20€ movement -> 80€ left, matching how the category
// actually behaves (no carryover between cycles).
function buildNormalLedger({ category, salary, cycle, transactions, pctHistory }) {
  const budget = catBudget(category, salary, pctHistory, cycle.end)
  const expenseCatById = {}
  transactions.forEach(t => { if (t.type === 'expense' && t.category_id) expenseCatById[t.id] = t.category_id })

  const rows = getTxInCycle(transactions, cycle)
    .filter(t =>
      (t.type === 'expense' && t.category_id === category.id) ||
      (t.type === 'transfer' && t.linked_expense_id && expenseCatById[t.linked_expense_id] === category.id)
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.created_at) - new Date(b.created_at))

  let remaining = budget
  return {
    budget,
    rows: rows.map(t => {
      const delta = t.type === 'expense' ? -t.amount : t.amount
      remaining += delta
      return { id: t.id, date: new Date(t.date), label: t.description, delta, remaining, isReimbursement: t.type === 'transfer' }
    })
  }
}

// 'pot' categories accumulate across every cycle since inception (or
// since a manually-adjusted opening balance). The ledger merges real
// transactions with one synthetic "cycle allocation" row per included
// cycle -- built from the exact same getIncludedCycles/
// isPotAffectingTx/potTxDelta/getPctAtDate helpers calcPotBalance
// itself uses, so the last row's running total is structurally
// guaranteed to match the pot's headline "Acumulado" figure shown
// elsewhere, instead of being a second hand-written copy that could
// silently drift from it.
function buildPotLedger({ category, salary, cycles, transactions, pctHistory }) {
  const openingDate = category.opening_balance_date ? new Date(category.opening_balance_date) : null
  const openingBalance = category.opening_balance || 0
  // Mirrors calcPotBalance exactly: a transaction that already existed
  // when the pot was reconciled stays excluded (it's baked into
  // openingBalance), but one added afterward still counts even if
  // it's dated before openingDate -- see the comment in
  // lib/finance.js's calcPotBalance for why this must be created_at,
  // not the transaction's own date.
  const openingSetAt = category.opening_balance_set_at ? new Date(category.opening_balance_set_at) : null

  const allocRows = getIncludedCycles(category, cycles).map(cy => {
    const pct = getPctAtDate(pctHistory, category.id, cy.end, category.user_pct)
    return {
      id: `cycle-${cy.index}`, date: cy.start, synthetic: true,
      label: `Asignación del ciclo (${pct}% del sueldo)`,
      delta: salary * pct / 100,
    }
  })

  const expenseCatById = {}
  transactions.forEach(t => { if (t.type === 'expense' && t.category_id) expenseCatById[t.id] = t.category_id })
  const txRows = transactions
    .filter(t => !(openingSetAt && new Date(t.created_at) < openingSetAt))
    .filter(t => isPotAffectingTx(t, category, expenseCatById))
    .map(t => ({ id: t.id, date: new Date(t.date), synthetic: false, label: t.description, delta: potTxDelta(t) }))

  const rows = [...allocRows, ...txRows].sort((a, b) => {
    const diff = new Date(a.date) - new Date(b.date)
    if (diff !== 0) return diff
    return a.synthetic === b.synthetic ? 0 : (a.synthetic ? -1 : 1)
  })

  let running = openingBalance
  return {
    openingDate, openingBalance,
    rows: rows.map(r => { running += r.delta; return { ...r, running } })
  }
}

function LedgerRow({ label, dateLabel, delta, afterLabel, afterValue, prefix }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '.5px solid var(--sep)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{prefix}{label}</div>
        <div className="text-xs text-muted">{dateLabel}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: delta >= 0 ? 'var(--e5)' : 'var(--r5)' }}>
          {delta >= 0 ? '+' : ''}{fmt(delta)}
        </div>
        <div className="text-xs text-muted">{afterLabel} {fmt(afterValue)}</div>
      </div>
    </div>
  )
}

export default function CategoryDetailModal({ category, onClose }) {
  const { profile, transactions, cycles, pctHistory } = useApp()
  const navigate = useNavigate()
  const salary = profile?.salary || 0
  const [cycleIndex, setCycleIndex] = useState(cycles.length ? cycles.length - 1 : null)
  // The pot ledger is oldest-first and scrolls inside a fixed-height box,
  // so open it scrolled to the end: the latest movements (the ones that
  // explain the 'Acumulado actual' total right below) are what matter.
  const scrollToEnd = useCallback(el => { if (el) el.scrollTop = el.scrollHeight }, [])

  if (category.type === 'saving') {
    const monthly = salary * category.user_pct / 100
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 420 }}>
          <h3 className="modal-title">{category.icon} {category.name}</h3>
          <p className="text-sm text-muted mb-3">
            Esta categoría de ahorro no tiene un histórico de movimientos propio: el total acumulado se gestiona en <strong>Mi Casa</strong>,
            junto con el resto de tu ahorro para la entrada e inversión.
          </p>
          <div className="stat-card indigo mb-3">
            <div className="label">Asignación planificada</div>
            <div className="value">{fmt(monthly)}/mes</div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { onClose(); navigate('/house') }}>
              <i className="fa fa-house" /> Ver Mi Casa
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (category.type === 'pot') {
    const { openingDate, openingBalance, rows } = buildPotLedger({ category, salary, cycles, transactions, pctHistory })
    const finalBalance = rows.length ? rows[rows.length - 1].running : openingBalance
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 560 }}>
          <h3 className="modal-title">{category.icon} {category.name} <span className="badge badge-amber">Bote</span></h3>
          {openingDate && (
            <div className="alert alert-info" style={{ marginBottom: 10 }}>
              <i className="fa fa-circle-info" />
              <div>Saldo ajustado manualmente el {openingDate.toLocaleDateString('es-ES')}: <strong>{fmt(openingBalance)}</strong></div>
            </div>
          )}
          <div ref={scrollToEnd} style={{ maxHeight: 380, overflowY: 'auto' }}>
            {rows.length === 0 ? (
              <div className="text-sm text-muted text-center" style={{ padding: 18 }}>Sin movimientos todavía.</div>
            ) : rows.map(r => (
              <LedgerRow
                key={r.id} label={r.label} prefix={r.synthetic ? '📥 ' : ''}
                dateLabel={r.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                delta={r.delta} afterLabel="quedan" afterValue={r.running}
              />
            ))}
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--g50)' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Acumulado actual</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: finalBalance < 0 ? 'var(--r5)' : 'var(--text)' }}>{fmt(finalBalance)}</span>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    )
  }

  // type === 'normal'
  const cycle = cycleIndex != null ? cycles[cycleIndex] : null
  const { budget, rows } = cycle
    ? buildNormalLedger({ category, salary, cycle, transactions, pctHistory })
    : { budget: 0, rows: [] }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3 className="modal-title">{category.icon} {category.name}</h3>
        {!cycle ? (
          <p className="text-sm text-muted">Añade tu primera nómina para empezar a ver movimientos por ciclo.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button className="btn btn-ghost btn-icon" disabled={cycleIndex === 0} onClick={() => setCycleIndex(i => i - 1)}>
                <i className="fa fa-chevron-left" />
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: 'center' }}>
                {cycle.start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} – {cycle.end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                {cycleIndex === cycles.length - 1 ? ' (actual)' : ''}
              </span>
              <button className="btn btn-ghost btn-icon" disabled={cycleIndex === cycles.length - 1} onClick={() => setCycleIndex(i => i + 1)}>
                <i className="fa fa-chevron-right" />
              </button>
            </div>
            <div className="text-sm text-muted mb-2">Presupuesto de este ciclo: <strong>{fmt(budget)}</strong></div>
            <div ref={scrollToEnd} style={{ maxHeight: 340, overflowY: 'auto' }}>
              {rows.length === 0 ? (
                <div className="text-sm text-muted text-center" style={{ padding: 18 }}>Sin movimientos en este ciclo.</div>
              ) : rows.map(r => (
                <LedgerRow
                  key={r.id} label={r.label} prefix={r.isReimbursement ? '↩️ ' : ''}
                  dateLabel={r.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  delta={r.delta} afterLabel="quedan" afterValue={r.remaining}
                />
              ))}
            </div>
          </>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
