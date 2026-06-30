import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../App'
import { addTransaction } from '../lib/supabase'
import ExtraPaymentModal from './ExtraPaymentModal'

const INCOME_TYPES = [
  { id: 'salary', label: '💼 Sueldo mensual', isSalary: true },
  { id: 'extra-payment', label: '🎉 Paga extra (repartir en botes/ahorro)', isSalary: false, isExtraPayment: true },
  { id: 'extra-family', label: '🎁 Dinero familiar', isSalary: false },
  { id: 'extra-reimb', label: '↩️ Devolución / regalo', isSalary: false },
  { id: 'extra-other', label: '💬 Otro ingreso', isSalary: false },
]

export default function AddTransactionModal({ onClose, onSaved }) {
  const { categories, refresh } = useApp()
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [incomeType, setIncomeType] = useState('salary')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const debounceRef = useRef(null)
  const [showExtraPaymentModal, setShowExtraPaymentModal] = useState(false)

  const expenseCats = categories.filter(c => c.type !== 'saving')
  const savingCats = categories.filter(c => c.type === 'saving')

  useEffect(() => {
    if (type === 'expense' && !categoryId && expenseCats.length) {
      setCategoryId(expenseCats[0].id)
    }
  }, [type, expenseCats, categoryId])

  // ── AUTO-CATEGORIZATION ──────────────────────────────────────
  // Debounced: after 800ms of no typing (4+ chars), suggest a category.
  // Always requires human confirmation — never auto-applies silently.
  useEffect(() => {
    if (type !== 'expense' || description.trim().length < 4) {
      setAiSuggestion(null)
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const apiKey = localStorage.getItem('fp_apikey')
      if (!apiKey || !apiKey.startsWith('sk-ant')) return // free mode: skip silently, no error
      try {
        const catList = expenseCats.map(c => `${c.id}: ${c.name}`).join(', ')
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Categoriza este gasto financiero personal. Responde SOLO con JSON sin markdown:\n{"category_id":"id_exacto","confidence":"high/medium/low","reason":"breve explicación"}\n\nCategorías disponibles: ${catList}\nDescripción del gasto: "${description}"\nImporte: ${amount || 'desconocido'} €`
            }]
          })
        })
        if (!res.ok) return
        const data = await res.json()
        let raw = data.content?.[0]?.text || '{}'
        raw = raw.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(raw)
        if (parsed.category_id && expenseCats.find(c => c.id === parsed.category_id)) {
          setAiSuggestion(parsed)
        }
      } catch (e) { /* silent fail — free mode or network issue, just skip */ }
    }, 800)
    return () => clearTimeout(debounceRef.current)
  }, [description, amount, type, expenseCats])

  const acceptSuggestion = () => {
    if (aiSuggestion) {
      setCategoryId(aiSuggestion.category_id)
      setAiSuggestion(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || !date || !description.trim()) {
      setError('Rellena cantidad, fecha y descripción')
      return
    }

    // Extra payments don't save as a single transaction here -- they
    // open the distribution modal instead, which handles creating the
    // income transaction itself once the user confirms how to split
    // it across pots/saving categories.
    if (type === 'income' && incomeType === 'extra-payment') {
      setShowExtraPaymentModal(true)
      return
    }

    setSaving(true)
    try {
      const payload = {
        type,
        amount: amt,
        date,
        description: description.trim(),
        notes: notes.trim() || null,
        category_id: type === 'expense' ? categoryId : null,
        is_salary: type === 'income' ? incomeType === 'salary' : false,
      }
      await addTransaction(payload)
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
        <h3 className="modal-title">Añadir movimiento</h3>

        <div className="tabs" style={{ marginBottom: 13 }}>
          <button type="button" className={`tab ${type === 'expense' ? 'active' : ''}`} onClick={() => setType('expense')}>💸 Gasto</button>
          <button type="button" className={`tab ${type === 'income' ? 'active' : ''}`} onClick={() => setType('income')}>💰 Ingreso / Nómina</button>
          <button type="button" className={`tab ${type === 'transfer' ? 'active' : ''}`} onClick={() => setType('transfer')}>↩️ Reembolso</button>
        </div>

        {type === 'income' && (
          <div className="alert alert-success">
            <i className="fa fa-circle-info" />
            <div>Si es tu <strong>nómina</strong>, elige "Sueldo mensual" — la fecha inicia un nuevo ciclo de gastos.</div>
          </div>
        )}
        {type === 'transfer' && (
          <div className="alert alert-info">
            <i className="fa fa-circle-info" />
            <div>Pagaste tú y te devolvieron (bizum). Compensa el gasto original.</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Cantidad (€) *</label>
              <input className="form-control" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div className="form-group">
              <label>Fecha *</label>
              <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Descripción *</label>
            <input className="form-control" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Gasolina, cena cumpleaños…" />
          </div>

          {type === 'expense' && (
            <div className="form-group">
              <label>Categoría *</label>
              <select className="form-control" value={categoryId} onChange={e => { setCategoryId(e.target.value); setAiSuggestion(null) }}>
                <optgroup label="Gastos">
                  {expenseCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </optgroup>
                <optgroup label="Ahorro / Inversión">
                  {savingCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </optgroup>
              </select>
              {aiSuggestion && aiSuggestion.category_id !== categoryId && (
                <div className="alert alert-info" style={{ marginTop: 8, marginBottom: 0, cursor: 'pointer' }} onClick={acceptSuggestion}>
                  <i className="fa fa-robot" />
                  <div>
                    IA sugiere: <strong>{expenseCats.find(c => c.id === aiSuggestion.category_id)?.icon} {expenseCats.find(c => c.id === aiSuggestion.category_id)?.name}</strong>
                    {' '}({aiSuggestion.confidence}) — {aiSuggestion.reason}
                    <div style={{ marginTop: 4 }}>
                      <button type="button" className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); acceptSuggestion() }}>
                        <i className="fa fa-check" /> Usar esta categoría
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {type === 'income' && (
            <div className="form-group">
              <label>Tipo de ingreso *</label>
              <select className="form-control" value={incomeType} onChange={e => setIncomeType(e.target.value)}>
                {INCOME_TYPES.map(it => <option key={it.id} value={it.id}>{it.label}</option>)}
              </select>
              {incomeType === 'extra-payment' && (
                <div className="alert alert-info" style={{ marginTop: 8 }}>
                  <i className="fa fa-circle-info" />
                  <div>Al continuar, podrás repartir este importe entre tus botes y categorías de ahorro/inversión. No cambia tu ciclo ni tu sueldo base.</div>
                </div>
              )}
            </div>
          )}

          {type === 'transfer' && (
            <div className="form-group">
              <label>Vinculado al gasto (opcional)</label>
              <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Cena del sábado" />
            </div>
          )}

          {type !== 'transfer' && (
            <div className="form-group">
              <label>Notas (opcional)</label>
              <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Cualquier anotación…" />
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {type === 'income' && incomeType === 'extra-payment'
                ? <><i className="fa fa-arrow-right" /> Continuar al reparto</>
                : <><i className="fa fa-check" /> {saving ? 'Guardando…' : 'Guardar'}</>}
            </button>
          </div>
        </form>
      </div>

      {showExtraPaymentModal && (
        <ExtraPaymentModal
          amount={parseFloat(amount) || 0}
          date={date}
          description={description.trim()}
          notes={notes.trim()}
          onClose={() => setShowExtraPaymentModal(false)}
          onSaved={() => {
            setShowExtraPaymentModal(false)
            onSaved?.()
            onClose()
          }}
        />
      )}
    </div>
  )
}
