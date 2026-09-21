import React, { useState } from 'react'
import { useApp } from '../App'
import { setCategoryOpeningBalance } from '../lib/supabase'
import { fmt, calcPotBalance, toLocalISODate } from '../lib/finance'
import { autoFocusOnPointer } from '../lib/ui'

// Lets the user declare "this is what I actually have in this pot
// today" -- e.g. money already saved outside the app before they
// started using this pot, or balance drift they want to correct.
// Writes categories.opening_balance/opening_balance_date, which
// calcPotBalance then counts forward from instead of its full
// calculated history (see lib/finance.js). Shared in spirit with the
// one-time BalanceReviewModal shown at login -- this is the same
// action available any time, per-pot, for anyone who skipped that
// prompt or wants to correct drift later.
export default function AdjustPotBalanceModal({ category, onClose }) {
  const { profile, transactions, cycles, pctHistory, refresh } = useApp()
  const salary = profile?.salary || 0
  const calculated = calcPotBalance({ category, salary, cycles, transactions, pctHistory })
  const [value, setValue] = useState(Math.round(calculated * 100) / 100)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const today = toLocalISODate(new Date())
      await setCategoryOpeningBalance(category.id, parseFloat(value) || 0, today)
      await refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <h3 className="modal-title">{category.icon} Ajustar saldo de "{category.name}"</h3>
        <p className="text-sm text-muted mb-3">
          La app calcula <strong>{fmt(calculated)}</strong> acumulado en este bote. Si sabes que la cantidad real es otra
          (por ejemplo, ya tenías dinero ahorrado de antes), indícala aquí — a partir de hoy la app contará desde esta cifra.
        </p>
        <div className="form-group">
          <label>Saldo real hoy (€)</label>
          <input
            className="form-control" type="number" step="0.01" autoFocus={autoFocusOnPointer()}
            value={value} onChange={e => setValue(e.target.value)}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <i className="fa fa-check" /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
