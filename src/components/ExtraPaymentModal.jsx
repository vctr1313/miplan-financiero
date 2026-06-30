import React, { useState, useMemo, useEffect } from 'react'
import { useApp } from '../App'
import { addTransaction, incrementHouseGoalSavings } from '../lib/supabase'
import { fmt } from '../lib/finance'

// Categories eligible to receive part of an extra payment: pots
// (Viajes, Regalos, Ropa, Imprevistos...) plus the two saving
// categories (Ahorro casa, Inversión). Regular 'normal' expense
// categories are intentionally excluded -- an extra payment is meant
// to be saved/distributed, not spent directly through this flow.
function getEligibleCategories(categories) {
  return categories.filter(c => c.type === 'pot' || c.type === 'saving')
}

export default function ExtraPaymentModal({ amount, date, description, notes, onClose, onSaved }) {
  const { categories, refresh } = useApp()
  const eligible = useMemo(() => getEligibleCategories(categories), [categories])

  // Best-effort starting suggestion for which house_goals field each
  // saving category maps to, based on its name -- purely a default to
  // pre-fill the dropdown below, never used directly to decide where
  // money goes. The user can change it freely per category, and
  // handleSubmit requires it to be explicitly set either way.
  const suggestedSavingTargets = useMemo(() => {
    const out = {}
    eligible.filter(c => c.type === 'saving').forEach(c => {
      out[c.id] = c.name.toLowerCase().includes('casa') ? 'house' : 'invest'
    })
    return out
  }, [eligible])

  // splits: { [categoryId]: '123.45' as typed string }
  // savingTargets: { [categoryId]: 'house' | 'invest' } -- only
  // relevant for type:'saving' categories, see the form field below.
  const [splits, setSplits] = useState({})
  const [savingTargets, setSavingTargets] = useState({})

  // Populate savingTargets from the computed suggestion once eligible
  // categories actually have data. useState's initial value alone
  // isn't enough here: categories arrives asynchronously from
  // useApp()'s context, so on first render eligible/suggestedSaving-
  // Targets would still be empty even though they're correct a moment
  // later -- this keeps the defaults in sync once real data shows up,
  // without overwriting anything the user has already changed by hand
  // (only fills in categories not yet present in savingTargets).
  useEffect(() => {
    setSavingTargets(prev => {
      const next = { ...prev }
      let changed = false
      Object.entries(suggestedSavingTargets).forEach(([catId, target]) => {
        if (next[catId] === undefined) {
          next[catId] = target
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [suggestedSavingTargets])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalSplit = useMemo(() => {
    return Object.values(splits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  }, [splits])

  const remaining = Math.round((amount - totalSplit) * 100) / 100
  // Tiny float tolerance (half a cent) instead of exact === 0, since
  // summing several parsed decimal inputs can land on something like
  // 999.9999999999999 instead of 1000 due to standard floating point
  // representation -- this is about avoiding a false "doesn't match"
  // error on a sum that's correct to the cent, not about loosening
  // the actual exact-sum requirement the user asked for.
  const matchesExactly = Math.abs(remaining) < 0.005

  // Rows where the user put money toward a saving-type category but
  // hasn't picked house/invest yet -- this would otherwise only
  // surface as a thrown error inside handleSubmit after clicking
  // confirm, which is correct but late; checking it here lets the
  // button itself reflect "not actually ready yet."
  const missingSavingTargets = eligible
    .filter(c => c.type === 'saving')
    .some(c => parseFloat(splits[c.id]) > 0 && !savingTargets[c.id])

  const handleSplitChange = (catId, value) => {
    setSplits(prev => ({ ...prev, [catId]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!matchesExactly) {
      setError(
        remaining > 0
          ? `Faltan ${fmt(remaining)} por repartir.`
          : `Te has pasado por ${fmt(Math.abs(remaining))}. La suma debe coincidir exactamente con el total.`
      )
      return
    }

    const activeSplits = Object.entries(splits)
      .map(([catId, v]) => [catId, parseFloat(v) || 0])
      .filter(([, v]) => v > 0)

    if (activeSplits.length === 0) {
      setError('Reparte el importe en al menos una categoría.')
      return
    }

    setSaving(true)
    try {
      // 1. Save the total as a regular income transaction first, so
      //    the cycle's balance/reports reflect the full extra payment
      //    exactly like any other income -- this is what keeps
      //    monthly totals correct without it counting as a new cycle
      //    (is_salary stays false) or touching the base salary.
      await addTransaction({
        type: 'income',
        amount,
        date,
        description: description || 'Paga extra',
        notes: notes || null,
        is_salary: false,
      })

      // 2. For each chosen category, either deposit into the pot
      //    (transactions table, pot-deposit type) or increment the
      //    relevant house_goals running total (my_saved / invest_saved)
      //    depending on which kind of category it is.
      let mySavedDelta = 0
      let investSavedDelta = 0

      for (const [catId, value] of activeSplits) {
        const cat = categories.find(c => c.id === catId)
        if (!cat) continue

        if (cat.type === 'pot') {
          await addTransaction({
            type: 'pot-deposit',
            category_id: catId,
            amount: value,
            date,
            description: `Reparto de paga extra: ${description || 'Paga extra'}`,
            notes: null,
            is_salary: false,
          })
        } else if (cat.type === 'saving') {
          const target = savingTargets[catId]
          if (target === 'house') {
            mySavedDelta += value
          } else if (target === 'invest') {
            investSavedDelta += value
          } else {
            // Shouldn't happen if the UI default below is working
            // correctly, but fail loudly instead of silently dropping
            // the money into the wrong bucket or nowhere at all.
            throw new Error(`Falta indicar el destino para "${cat.name}" (¿casa o inversión?).`)
          }
        }
      }

      if (mySavedDelta > 0 || investSavedDelta > 0) {
        await incrementHouseGoalSavings({
          mySavedDelta,
          investSavedDelta,
        })
      }

      await refresh()
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <h3 className="modal-title">🎉 Repartir paga extra</h3>

        <div className="alert alert-info">
          <i className="fa fa-circle-info" />
          <div>Reparte <strong>{fmt(amount)}</strong> entre tus botes y categorías de ahorro. La suma debe coincidir exactamente con el total.</div>
        </div>

        <form onSubmit={handleSubmit}>
          {eligible.length === 0 ? (
            <div className="alert alert-warning">
              <i className="fa fa-triangle-exclamation" />
              <div>No tienes botes ni categorías de ahorro configuradas. Crea alguna en Presupuesto primero.</div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {eligible.map(cat => (
                <div key={cat.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--g100)' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 18, width: 26 }}>{cat.icon}</span>
                    <span style={{ flex: 1, fontSize: 13.5 }}>
                      {cat.name}
                      {cat.type === 'saving' && <span className="badge badge-green" style={{ marginLeft: 6 }}>Ahorro</span>}
                      {cat.type === 'pot' && <span className="badge badge-amber" style={{ marginLeft: 6 }}>Bote</span>}
                    </span>
                    <input
                      type="number" min="0" step="0.01"
                      value={splits[cat.id] ?? ''}
                      onChange={e => handleSplitChange(cat.id, e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: 100, padding: '6px 8px', border: '1px solid var(--border)',
                        borderRadius: 6, fontSize: 13.5, fontWeight: 600,
                        background: 'var(--inp)', color: 'var(--text)', textAlign: 'right'
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--muted)', width: 14 }}>€</span>
                  </div>
                  {cat.type === 'saving' && parseFloat(splits[cat.id]) > 0 && (
                    <div className="flex items-center gap-2" style={{ marginTop: 6, marginLeft: 34 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Destino:</span>
                      <select
                        className="form-control"
                        value={savingTargets[cat.id] || ''}
                        onChange={e => setSavingTargets(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        style={{ fontSize: 12, padding: '4px 8px', maxWidth: 200 }}
                      >
                        <option value="">Elige destino…</option>
                        <option value="house">🏠 Meta de la casa</option>
                        <option value="invest">📈 Total invertido</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div
            className="flex items-center justify-between"
            style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 14,
              background: matchesExactly ? 'var(--e50)' : 'var(--r50)',
              border: `1px solid ${matchesExactly ? 'var(--e100)' : 'var(--r100)'}`
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: matchesExactly ? 'var(--e6)' : 'var(--r5)' }}>
              {matchesExactly ? '✓ Suma correcta' : remaining > 0 ? 'Falta repartir' : 'Te has pasado'}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: matchesExactly ? 'var(--e6)' : 'var(--r5)' }}>
              {fmt(Math.abs(remaining))}
            </span>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {!error && missingSavingTargets && (
            <div className="alert alert-warning">
              <i className="fa fa-triangle-exclamation" />
              <div>Elige el destino (casa o inversión) para cada categoría de ahorro con importe asignado.</div>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !matchesExactly || missingSavingTargets || eligible.length === 0}>
              <i className="fa fa-check" /> {saving ? 'Guardando…' : 'Confirmar reparto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
