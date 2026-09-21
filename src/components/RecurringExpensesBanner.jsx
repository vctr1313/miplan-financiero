import React, { useEffect, useState } from 'react'
import { useApp } from '../App'
import { addTransaction, markFixedExpenseCharged } from '../lib/supabase'
import { getPendingFixedExpenses, fmt, getCurrentCycle } from '../lib/finance'

export default function RecurringExpensesBanner() {
  const { fixedExpenses, cycles, refresh } = useApp()
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [checked, setChecked] = useState(() => new Set())
  // What was just confirmed, kept so the stamp can still be shown after
  // refresh() has emptied the pending list underneath it.
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDismissed(true), 1900)
    return () => clearTimeout(t)
  }, [done])

  const cycle = getCurrentCycle(cycles)
  const pending = getPendingFixedExpenses({ fixedExpenses, cycle })

  if (!cycle || dismissed) return null

  if (done) {
    return (
      <div className="card mb-4 fixed-done" style={{ background: 'var(--e50)', borderColor: 'transparent' }}>
        <div className="stamp" aria-hidden="true"><i className="fa fa-check" /> Registrado</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{done.count} gasto{done.count !== 1 ? 's' : ''} fijo{done.count !== 1 ? 's' : ''} registrado{done.count !== 1 ? 's' : ''}</div>
        <div className="text-sm text-muted">{fmt(done.total)} añadidos a este ciclo</div>
      </div>
    )
  }

  if (pending.length === 0) return null

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
      setDone({ count: toApply.length, total: toApply.reduce((sum, f) => sum + f.amount, 0) })
    } finally {
      setApplying(false)
    }
  }

  const totalSelected = pending.filter(f => checked.has(f.id)).reduce((s, f) => s + f.amount, 0)

  return (
    <div className="card mb-4" style={{ background: 'var(--a100)', borderColor: 'transparent' }}>
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
