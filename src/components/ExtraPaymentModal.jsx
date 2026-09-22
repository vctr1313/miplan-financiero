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

// kind distinguishes two flows that share this exact
// distribute-across-pots mechanic but differ in where the money comes
// from: 'extra-payment' is genuine new income (a bonus/paga extra)
// and IS recorded as an income transaction, exactly like before.
// 'from-savings' moves money that's already inside the app -- out of
// one of the user's own saving-type categories (chosen via `sourceId`
// below) -- into pots/other saving categories. That's an internal
// transfer, not new income, so it must never touch the income total:
// no income transaction is written for it, and the source category's
// house_goals bucket (my_saved/invest_saved -- the only place a
// saving-type category's total lives today) is debited by the same
// amount the destinations are credited.
export default function ExtraPaymentModal({ amount, date, description, notes, onClose, onSaved, kind = 'extra-payment' }) {
  const isWithdrawal = kind === 'from-savings'
  const defaultDesc = isWithdrawal ? 'Retirada de ahorro' : 'Paga extra'
  const { categories, houseGoal, refresh } = useApp()
  const [sourceId, setSourceId] = useState('')
  const savingCats = useMemo(() => categories.filter(c => c.type === 'saving'), [categories])
  // Which house_goals total this saving category feeds. Set explicitly
  // per category (Presupuesto -> editar categoría); the name fallback
  // is only for a row created before that column existed.
  const bucketOf = (cat) => cat.saving_bucket || (cat.name.toLowerCase().includes('casa') ? 'house' : 'invest')
  const bucketBalance = (cat) => bucketOf(cat) === 'house' ? (houseGoal?.my_saved || 0) : (houseGoal?.invest_saved || 0)
  const sourceCat = isWithdrawal ? savingCats.find(c => c.id === sourceId) : null
  const sourceBucket = sourceCat ? bucketOf(sourceCat) : null
  const sourceBalance = sourceCat ? bucketBalance(sourceCat) : null

  const eligible = useMemo(
    () => getEligibleCategories(categories).filter(c => !isWithdrawal || c.id !== sourceId),
    [categories, isWithdrawal, sourceId]
  )

  // Pre-fills the per-row destination dropdown from each category's
  // own configured bucket. Still only a default -- the user can
  // override it for this one distribution, and handleSubmit requires
  // it to be set either way.
  const suggestedSavingTargets = useMemo(() => {
    const out = {}
    eligible.filter(c => c.type === 'saving').forEach(c => { out[c.id] = bucketOf(c) })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (isWithdrawal && !sourceId) {
      setError('Elige de qué categoría de ahorro sale el dinero.')
      return
    }
    if (isWithdrawal && sourceBalance !== null && amount > sourceBalance) {
      setError(`Saldo insuficiente en origen. Disponible: ${fmt(sourceBalance)}`)
      return
    }

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
      // 1. Genuine new income (paga extra) is saved as a regular
      //    income transaction, so the cycle's balance/reports reflect
      //    it exactly like any other income (is_salary stays false,
      //    doesn't start a new cycle). A savings withdrawal is money
      //    that already existed inside the app moving between its own
      //    buckets -- recording it as income too would double-count
      //    it, so this step is skipped entirely for that flow; the
      //    source bucket is debited below instead.
      if (!isWithdrawal) {
        await addTransaction({
          type: 'income',
          amount,
          date,
          description: description || defaultDesc,
          notes: notes || null,
          is_salary: false,
        })
      }

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
            description: `${isWithdrawal ? 'Retirada de ahorro' : 'Reparto de paga extra'}: ${description || defaultDesc}`,
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

      // A withdrawal debits its source bucket by the full amount, in
      // the same call that credits the destinations -- one atomic
      // net-delta RPC instead of two separate writes.
      if (isWithdrawal && sourceBucket === 'house') mySavedDelta -= amount
      if (isWithdrawal && sourceBucket === 'invest') investSavedDelta -= amount

      if (mySavedDelta !== 0 || investSavedDelta !== 0) {
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
        <h3 className="modal-title">{isWithdrawal ? '📤 Repartir retirada de ahorro' : '🎉 Repartir paga extra'}</h3>

        <div className="alert alert-info">
          <i className="fa fa-circle-info" />
          <div>
            {isWithdrawal
              ? <>Este dinero sale de una de tus categorías de ahorro — elige cuál abajo. Repártelo entre tus botes u otras categorías de ahorro/inversión — la suma debe coincidir exactamente con <strong>{fmt(amount)}</strong>. No cuenta como ingreso nuevo.</>
              : <>Reparte <strong>{fmt(amount)}</strong> entre tus botes y categorías de ahorro. La suma debe coincidir exactamente con el total.</>}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {isWithdrawal && (
            <div className="form-group">
              <label>¿De qué categoría de ahorro sale el dinero? *</label>
              <select className="form-control" value={sourceId} onChange={e => setSourceId(e.target.value)}>
                <option value="">Selecciona categoría…</option>
                {savingCats.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name} ({fmt(bucketBalance(c))})</option>
                ))}
              </select>
              {sourceBalance !== null && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Disponible: {fmt(sourceBalance)}</div>
              )}
            </div>
          )}
          {eligible.length === 0 ? (
            <div className="alert alert-warning">
              <i className="fa fa-triangle-exclamation" />
              <div>
                {isWithdrawal && sourceId
                  ? 'No tienes otro bote o categoría de ahorro donde repartir este dinero. Crea uno en Presupuesto primero.'
                  : 'No tienes botes ni categorías de ahorro configuradas. Crea alguna en Presupuesto primero.'}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {eligible.map(cat => (
                <div key={cat.id} style={{ padding: '8px 0', borderBottom: '.5px solid var(--sep)' }}>
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
            <button
              type="submit" className={`btn btn-primary ${saving ? 'is-busy' : ''}`}
              disabled={
                saving || !matchesExactly || missingSavingTargets || eligible.length === 0 ||
                (isWithdrawal && (!sourceId || (sourceBalance !== null && amount > sourceBalance)))
              }
            >
              <i className="fa fa-check" /> {saving ? 'Guardando…' : isWithdrawal ? 'Confirmar retirada' : 'Confirmar reparto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
