import React, { useState } from 'react'
import { useApp } from '../App'
import { updateProfile, setCategoryOpeningBalance } from '../lib/supabase'
import { calcPotBalance, toLocalISODate } from '../lib/finance'

// Shown once, the first time an existing user opens the app after
// this feature ships (gated on profiles.balances_reviewed_at). Past
// budget-% changes could never be perfectly reconstructed (the
// values genuinely weren't recorded before now -- see
// category_pct_history in lib/finance.js), so this is the honest
// alternative: let the user say what they actually have today, which
// becomes the new baseline calcPotBalance counts forward from. If
// they decline, nothing changes -- the app keeps using its
// calculated figures exactly as it does today.
export default function BalanceReviewModal({ pots, onClose }) {
  const { profile, transactions, cycles, pctHistory, refresh } = useApp()
  const salary = profile?.salary || 0
  const [values, setValues] = useState(() => {
    const initial = {}
    pots.forEach(c => {
      initial[c.id] = Math.round(calcPotBalance({ category: c, salary, cycles, transactions, pctHistory }) * 100) / 100
    })
    return initial
  })
  const [saving, setSaving] = useState(false)

  const handleSkip = async () => {
    setSaving(true)
    try {
      await updateProfile(profile.id, { balances_reviewed_at: new Date().toISOString() })
      await refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const today = toLocalISODate(new Date())
      for (const c of pots) {
        const calculated = Math.round(calcPotBalance({ category: c, salary, cycles, transactions, pctHistory }) * 100) / 100
        const typed = parseFloat(values[c.id])
        if (!isNaN(typed) && typed !== calculated) {
          await setCategoryOpeningBalance(c.id, typed, today)
        }
      }
      await updateProfile(profile.id, { balances_reviewed_at: new Date().toISOString() })
      await refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <h3 className="modal-title">🪣 ¿Cuánto tienes realmente en tus botes?</h3>
        <p className="text-sm text-muted mb-3">
          Estamos corrigiendo un fallo por el que cambiar un presupuesto afectaba también a lo que ya tenías acumulado en meses
          anteriores. Como esos importes antiguos no se pueden reconstruir con certeza, dinos cuánto tienes hoy realmente en
          cada bote y la app calculará todo lo siguiente a partir de esa cifra. Si prefieres no tocarlo, se mantiene la cifra
          calculada actual.
        </p>
        <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
          {pots.map(c => (
            <div key={c.id} className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '.5px solid var(--sep)' }}>
              <span style={{ fontSize: 18, width: 26 }}>{c.icon}</span>
              <span style={{ flex: 1, fontSize: 13.5 }}>{c.name}</span>
              <input
                type="number" step="0.01"
                value={values[c.id] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                style={{
                  width: 110, padding: '6px 8px', border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 13.5, fontWeight: 600,
                  background: 'var(--inp)', color: 'var(--text)', textAlign: 'right'
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--muted)', width: 14 }}>€</span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={handleSkip} disabled={saving}>
            No, mantener así
          </button>
          <button className={`btn btn-primary ${saving ? 'is-busy' : ''}`} onClick={handleConfirm} disabled={saving}>
            <i className="fa fa-check" /> {saving ? 'Guardando…' : 'Sí, ajustar'}
          </button>
        </div>
      </div>
    </div>
  )
}
