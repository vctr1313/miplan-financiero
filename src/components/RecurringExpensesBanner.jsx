import React, { useState } from 'react'
import { useApp } from '../App'
import { addTransaction, markFixedExpenseCharged } from '../lib/supabase'
import { getPendingFixedExpenses, fmt, getCurrentCycle } from '../lib/finance'

export default function RecurringExpensesBanner() {
  const { fixedExpenses, cycles, refresh } = useApp()
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [checked, setChecked] = useState(() => new Set())

  const cycle = getCurrentCycle(cycles)
  const pending = getPendingFixedExpenses({ fixedExpenses, cycle })

  if (!cycle || pending.length === 0 || dismissed) return null

  const toggle = (id) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allChecked = pending.every(f => checked.has(f.id)) && pending.length > 0
  const someChecked = pending.some(f => checked.has(f.id))

  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(pending.map(f => f.id)))
  }

  const handleConfirm = async () => {
    const toApply = pending.filter(f => checked.has(f.id))
    if (!toApply.length) return
    setApplying(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      for (const f of toApply) {
        await addTransaction({
          type: 'expense',
          amount: f.amount,
          date: today,
          description: f.name,
          category_id: f.category_id,
          notes: 'Gasto fijo recurrente (auto-registrado)',
          is_salary: false,
        })
        await markFixedExpenseCharged(f.id, today)
      }
      await refresh()
      setDismissed(true)
    } finally {
      setApplying(false)
    }
  }

  const totalSelected = pending.filter(f => checked.has(f.id)).reduce((s, f) => s + f.amount, 0)

  return (
    <div className="card mb-4" style={{ borderLeft: '3px solid var(--a5)' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ fontSize: 13.5, fontWeight: 600 }}>
          <i className="fa fa-rotate" style={{ color: 'var(--a5)', marginRight: 6 }} />
          Gastos fijos pendientes este ciclo
        </h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setDismissed(true)}>
          <i className="fa fa-xmark" /> Más tarde
        </button>
      </div>
      <p className="text-xs text-muted mb-2">
        Estos gastos recurrentes aún no se han registrado en el ciclo actual. Marca los que quieras confirmar.
      </p>
      <div style={{ marginBottom: 10 }}>
        <label className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 500, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          Seleccionar todos ({pending.length})
        </label>
        {pending.map(f => (
          <label key={f.id} className="flex items-center gap-2" style={{ padding: '6px 0', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked.has(f.id)} onChange={() => toggle(f.id)} />
            <span style={{ fontSize: 16 }}>{f.icon}</span>
            <span style={{ flex: 1 }}>{f.name}</span>
            <span style={{ fontWeight: 600, color: 'var(--r5)' }}>{fmt(f.amount)}</span>
          </label>
        ))}
      </div>
      <button
        className="btn btn-primary"
        disabled={!someChecked || applying}
        onClick={handleConfirm}
      >
        <i className="fa fa-check" /> {applying ? 'Confirmando…' : `Confirmar seleccionados (${fmt(totalSelected)})`}
      </button>
    </div>
  )
}
