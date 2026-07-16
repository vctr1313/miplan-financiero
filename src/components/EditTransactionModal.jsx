import React, { useState, useMemo } from 'react'
import { useApp } from '../App'
import { updateTransaction } from '../lib/supabase'
import { fmt } from '../lib/finance'

const TYPE_LABELS = {
  expense: '💸 Gasto',
  income: '💰 Ingreso',
  transfer: '↩️ Reembolso',
  'pot-deposit': '🪣 Depósito en bote',
  'pot-withdrawal': '🪣 Retirada de bote',
}

export default function EditTransactionModal({ tx, onClose, onSaved }) {
  const { categories, transactions, refresh } = useApp()
  const [amount, setAmount] = useState(String(tx.amount))
  const [date, setDate] = useState(tx.date)
  const [description, setDescription] = useState(tx.description)
  const [notes, setNotes] = useState(tx.notes || '')
  const [categoryId, setCategoryId] = useState(tx.category_id || '')
  const [linkedExpenseId, setLinkedExpenseId] = useState(tx.linked_expense_id || null)
  const [expenseSearch, setExpenseSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const expenseCats = categories.filter(c => c.type !== 'saving')
  const savingCats = categories.filter(c => c.type === 'saving')

  const recentExpenses = useMemo(() =>
    transactions
      .filter(t => t.type === 'expense' && t.id !== tx.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 150),
    [transactions, tx.id]
  )
  const filteredExpenses = expenseSearch.trim()
    ? recentExpenses.filter(t => t.description.toLowerCase().includes(expenseSearch.toLowerCase()))
    : recentExpenses
  const linkedExpense = linkedExpenseId ? recentExpenses.find(t => t.id === linkedExpenseId) : null

  const handleSave = async () => {
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || !date || !description.trim()) {
      setError('Cantidad, fecha y descripción son obligatorios')
      return
    }
    setSaving(true)
    try {
      const patch = {
        amount: amt,
        date,
        description: description.trim(),
        notes: notes.trim() || null,
      }
      if (tx.type === 'expense') patch.category_id = categoryId || null
      if (tx.type === 'transfer') patch.linked_expense_id = linkedExpenseId || null
      await updateTransaction(tx.id, patch)
      await refresh()
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 490 }}>
        <h3 className="modal-title">Editar movimiento</h3>
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          <i className="fa fa-circle-info" />
          <div>Tipo: <strong>{TYPE_LABELS[tx.type] || tx.type}</strong></div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Cantidad (€) *</label>
            <input className="form-control" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label>Fecha *</label>
            <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Descripción *</label>
          <input className="form-control" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        {tx.type === 'expense' && (
          <div className="form-group">
            <label>Categoría</label>
            <select className="form-control" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <optgroup label="Gastos">
                {expenseCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
              <optgroup label="Ahorro / Inversión">
                {savingCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
            </select>
          </div>
        )}

        {tx.type === 'transfer' && (
          <div className="form-group">
            <label>Gasto que compensa (opcional)</label>
            {linkedExpense ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--e50)', border: '1px solid var(--e100)' }}>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{linkedExpense.description}</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                    {new Date(linkedExpense.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {fmt(linkedExpense.amount)}
                  </span>
                </div>
                <button type="button" onClick={() => { setLinkedExpenseId(null); setExpenseSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>
                  <i className="fa fa-xmark" />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input className="form-control" value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)} placeholder="Buscar gasto…" />
                {filteredExpenses.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2 }}>
                    {filteredExpenses.slice(0, 10).map(t => (
                      <div key={t.id} onClick={() => { setLinkedExpenseId(t.id); setExpenseSearch('') }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--g100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--g50)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}{t.categories?.name ? ` · ${t.categories.name}` : ''}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--r5)', flexShrink: 0 }}>-{fmt(t.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Notas (opcional)</label>
          <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Cualquier anotación…" />
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <i className="fa fa-check" /> {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
