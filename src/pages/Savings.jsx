import React, { useState } from 'react'
import { useApp } from '../App'
import { addTransaction } from '../lib/supabase'
import { fmt, calcPotBalance } from '../lib/finance'

export default function Savings() {
  const { profile, categories, transactions, cycles, refresh } = useApp()
  const salary = profile?.salary || 0
  const [potId, setPotId] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
    const balance = calcPotBalance({ category: cat, salary, cycles, transactions })
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
        <h2>Botes de ahorro</h2>
        <p>Se acumulan mes a mes desde tu primera nómina registrada</p>
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
          const bal = isPot ? calcPotBalance({ category: c, salary, cycles, transactions }) : null
          const monthly = salary * c.user_pct / 100
          return (
            <div key={c.id} className="card" style={{ borderTop: `3px solid ${c.color}` }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g700)' }}>{c.name}</div>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, color: c.color }}>
                {isPot ? fmt(bal) : fmt(monthly) + '/mes'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                {isPot ? `+${fmt(monthly)} cada ciclo` : c.name.toLowerCase().includes('casa') ? '🏠 Para la casa' : '📈 Inversión'}
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
                    {c.icon} {c.name} ({fmt(calcPotBalance({ category: c, salary, cycles, transactions }))})
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
    </div>
  )
}
