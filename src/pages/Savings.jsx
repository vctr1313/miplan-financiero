import React, { useState } from 'react'
import { useApp } from '../App'
import { addTransaction } from '../lib/supabase'
import { fmt, calcPotBalance } from '../lib/finance'

function MovePotModal({ pots, salary, cycles, transactions, pctHistory, refresh, onClose }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const fromBal = fromId ? calcPotBalance({ category: pots.find(p => p.id === fromId), salary, cycles, transactions, pctHistory }) : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!fromId || !toId || !amt || amt <= 0) { setError('Rellena todos los campos'); return }
    if (fromId === toId) { setError('El bote origen y destino deben ser distintos'); return }
    if (fromBal !== null && amt > fromBal) {
      setError(`Saldo insuficiente en origen. Disponible: ${fmt(fromBal)}`)
      return
    }
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const fromCat = pots.find(p => p.id === fromId)
      const toCat = pots.find(p => p.id === toId)
      const label = desc.trim() || `Traspaso ${fromCat.name} → ${toCat.name}`
      await addTransaction({ type: 'pot-withdrawal', category_id: fromId, amount: amt, date: today, description: label })
      await addTransaction({ type: 'pot-deposit', category_id: toId, amount: amt, date: today, description: label })
      await refresh()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <h3 className="modal-title">Mover dinero entre botes</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Desde</label>
              <select className="form-control" value={fromId} onChange={e => setFromId(e.target.value)}>
                <option value="">Selecciona bote…</option>
                {pots.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name} ({fmt(calcPotBalance({ category: p, salary, cycles, transactions, pctHistory }))})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Hacia</label>
              <select className="form-control" value={toId} onChange={e => setToId(e.target.value)}>
                <option value="">Selecciona bote…</option>
                {pots.filter(p => p.id !== fromId).map(p => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Cantidad (€) *</label>
              <input className="form-control" type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              {fromBal !== null && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Disponible: {fmt(fromBal)}</div>}
            </div>
            <div className="form-group">
              <label>Descripción (opcional)</label>
              <input className="form-control" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Refuerzo viajes" />
            </div>
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <i className="fa fa-arrow-right-arrow-left" /> {saving ? 'Moviendo…' : 'Mover dinero'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Savings() {
  const { profile, categories, transactions, cycles, pctHistory, refresh } = useApp()
  const salary = profile?.salary || 0
  const [potId, setPotId] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showMove, setShowMove] = useState(false)

  const pots = categories.filter(c => c.type === 'pot')
  const savingCats = categories.filter(c => c.type === 'saving')

  const handleWithdraw = async (e) => {
    e.preventDefault()
    setError('')
    if (!potId || !amount || parseFloat(amount) <= 0) {
      setError('Rellena todos los campos')
      return
    }
    const cat = categories.find(c => c.id === potId)
    const balance = calcPotBalance({ category: cat, salary, cycles, transactions, pctHistory })
    if (parseFloat(amount) > balance) {
      setError(`No tienes suficiente. Disponible: ${fmt(balance)}`)
      return
    }
    setSaving(true)
    try {
      await addTransaction({
        type: 'pot-withdrawal',
        category_id: potId,
        amount: parseFloat(amount),
        date: new Date().toISOString().split('T')[0],
        description: desc.trim() || 'Retirada de bote',
      })
      await refresh()
      setAmount(''); setDesc(''); setPotId('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2>Botes de ahorro</h2>
            <p>Se acumulan mes a mes desde tu primera nómina registrada</p>
          </div>
          {pots.length >= 2 && (
            <button className="btn btn-outline" onClick={() => setShowMove(true)}>
              <i className="fa fa-arrow-right-arrow-left" /> Mover dinero
            </button>
          )}
        </div>
      </div>

      <div className="alert alert-success mb-4">
        <i className="fa fa-circle-info" />
        <div>
          <strong>¿Cómo funciona?</strong> Tras registrar tu primera nómina, cada ciclo se añade la cantidad asignada.
          Si no gastas el bote de viajes un mes, el siguiente tendrás el doble. Antes de la primera nómina todos los botes están en 0 €.
        </div>
      </div>

      <div className="grid-auto mb-4">
        {[...pots, ...savingCats].map(c => {
          const isPot = c.type === 'pot'
          const bal = isPot ? calcPotBalance({ category: c, salary, cycles, transactions, pctHistory }) : null
          const isNegative = isPot && bal < 0
          const monthly = salary * c.user_pct / 100
          return (
            <div key={c.id} className="card" style={{ borderTop: `3px solid ${isNegative ? 'var(--r5)' : c.color}` }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g700)' }}>{c.name}</div>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, color: isNegative ? 'var(--r5)' : c.color }}>
                {isPot ? fmt(bal) : fmt(monthly) + '/mes'}
              </div>
              <div style={{ fontSize: 10.5, color: isNegative ? 'var(--r5)' : 'var(--muted)' }}>
                {isPot
                  ? (isNegative ? `En negativo, se recupera con +${fmt(monthly)} cada ciclo` : `+${fmt(monthly)} cada ciclo`)
                  : c.name.toLowerCase().includes('casa') ? '🏠 Para la casa' : '📈 Inversión'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="section-header"><h3>Retirar de un bote</h3></div>
        <form onSubmit={handleWithdraw}>
          <div className="form-row">
            <div className="form-group">
              <label>Bote</label>
              <select className="form-control" value={potId} onChange={e => setPotId(e.target.value)}>
                <option value="">Selecciona bote…</option>
                {pots.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name} ({fmt(calcPotBalance({ category: c, salary, cycles, transactions, pctHistory }))})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Cantidad (€)</label>
              <input className="form-control" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <input className="form-control" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Vuelo verano" />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                <i className="fa fa-arrow-right-from-bracket" /> Retirar
              </button>
            </div>
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
        </form>
      </div>

      {showMove && (
        <MovePotModal
          pots={pots}
          salary={salary}
          cycles={cycles}
          transactions={transactions}
          pctHistory={pctHistory}
          refresh={refresh}
          onClose={() => setShowMove(false)}
        />
      )}
    </div>
  )
}
