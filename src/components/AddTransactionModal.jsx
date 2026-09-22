import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../App'
import { addTransaction, deleteTransaction, addSharedExpense } from '../lib/supabase'
import { partnerShare } from '../lib/shared'
import { fmt, toLocalISODate } from '../lib/finance'
import { validateSplit, splitRemaining } from '../lib/split'
import { autoFocusOnPointer } from '../lib/ui'
import AmountPad, { formatAmountDisplay } from './AmountPad'
import ExtraPaymentModal from './ExtraPaymentModal'

const INCOME_TYPES = [
  { id: 'salary', label: '💼 Sueldo mensual', isSalary: true },
  { id: 'extra-payment', label: '🎉 Paga extra (repartir en botes/ahorro)', isSalary: false, isExtraPayment: true },
  { id: 'from-savings', label: '📤 Retirada de ahorros (repartir en botes/ahorro)', isSalary: false, isSavingsWithdrawal: true },
  { id: 'extra-family', label: '🎁 Dinero familiar', isSalary: false },
  { id: 'extra-reimb', label: '↩️ Devolución / regalo', isSalary: false },
  { id: 'extra-other', label: '💬 Otro ingreso', isSalary: false },
]

// Income sub-types that don't save directly -- they open the
// distribution modal instead (see ExtraPaymentModal's `kind` prop),
// which handles creating the income transaction itself once the user
// confirms how to split it across pots/saving categories.
const DISTRIBUTED_INCOME_TYPES = ['extra-payment', 'from-savings']

export default function AddTransactionModal({ onClose, onSaved, startShared = false }) {
  const { categories, transactions, refresh, profile, partnerSummary } = useApp()
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  // Touch devices get the in-sheet keypad instead of the system keyboard.
  const [usePad] = useState(() => !autoFocusOnPointer())
  const [padOpen, setPadOpen] = useState(true)
  // Sharing an expense with the linked partner (expenses only).
  const partnerId = profile?.partner_id || null
  const partnerName = partnerSummary?.partner_name || 'tu pareja'
  const [shareOn, setShareOn] = useState(startShared)
  const [shareMode, setShareMode] = useState('half')
  const [shareCustom, setShareCustom] = useState('')
  const theirPart = partnerShare(shareMode, amount, shareCustom)
  // Splitting one purchase across categories (expenses only).
  const [splitMode, setSplitMode] = useState(false)
  const [splitLines, setSplitLines] = useState([])
  const newLine = (categoryId = '') => ({ key: Math.random().toString(36).slice(2), categoryId, amount: '' })
  const startSplit = () => {
    setSplitLines([{ ...newLine(categoryId), amount: amount || '' }, newLine()])
    setSplitMode(true)
  }
  const updateLine = (key, patch) => setSplitLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key) => setSplitLines(ls => ls.filter(l => l.key !== key))
  const fillRest = (key) => {
    setSplitLines(ls => {
      const others = ls.filter(l => l.key !== key)
      const rest = splitRemaining(amount, others)
      return ls.map(l => (l.key === key ? { ...l, amount: rest > 0 ? rest.toFixed(2) : '' } : l))
    })
  }
  const [date, setDate] = useState(toLocalISODate(new Date()))
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [incomeType, setIncomeType] = useState('salary')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const debounceRef = useRef(null)
  const [showExtraPaymentModal, setShowExtraPaymentModal] = useState(false)
  const [linkedExpenseId, setLinkedExpenseId] = useState(null)
  const [expenseSearch, setExpenseSearch] = useState('')

  const expenseCats = categories.filter(c => c.type !== 'saving')
  const savingCats = categories.filter(c => c.type === 'saving')
  const recentExpenses = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 150)
  const filteredExpenses = expenseSearch.trim()
    ? recentExpenses.filter(t => t.description.toLowerCase().includes(expenseSearch.toLowerCase()))
    : recentExpenses

  const linkedExpense = linkedExpenseId ? recentExpenses.find(t => t.id === linkedExpenseId) : null

  useEffect(() => {
    if (type !== 'transfer') {
      setLinkedExpenseId(null)
      setExpenseSearch('')
    }
  }, [type])

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

    if (type === 'income' && DISTRIBUTED_INCOME_TYPES.includes(incomeType)) {
      setShowExtraPaymentModal(true)
      return
    }

    if (type === 'expense' && splitMode) {
      const problem = validateSplit(amount, splitLines)
      if (problem) { setError(problem); return }
      setSaving(true)
      const group = window.crypto.randomUUID()
      const created = []
      try {
        for (const l of splitLines) {
          const row = await addTransaction({
            type: 'expense', amount: parseFloat(l.amount), date,
            description: description.trim(), notes: notes.trim() || null,
            category_id: l.categoryId, is_salary: false, split_group: group,
          })
          created.push(row.id)
        }
        await refresh()
        onSaved?.()
        onClose()
      } catch (err) {
        // All parts or none: undo the ones already saved.
        await Promise.all(created.map(id => deleteTransaction(id).catch(() => {})))
        setError(err.message)
      } finally {
        setSaving(false)
      }
      return
    }

    if (type === 'expense' && shareOn && partnerId) {
      if (theirPart == null) { setError(`Indica la parte de ${partnerName} (entre 0 y el total)`); return }
      setSaving(true)
      try {
        await addSharedExpense({
          expense: {
            amount: amt, date, description: description.trim(),
            notes: notes.trim() || null, category_id: categoryId, is_salary: false,
          },
          partnerShare: theirPart,
          partnerId,
          partnerName,
        })
        await refresh()
        onSaved?.()
        onClose()
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
      }
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
        linked_expense_id: type === 'transfer' ? (linkedExpenseId || null) : null,
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
          <button type="button" className={`tab ${type === 'expense' ? 'active' : ''}`} onClick={() => setType('expense')}><i className="fa fa-arrow-up" /> Gasto</button>
          <button type="button" className={`tab ${type === 'income' ? 'active' : ''}`} onClick={() => setType('income')}><i className="fa fa-arrow-down" /> Ingreso</button>
          <button type="button" className={`tab ${type === 'transfer' ? 'active' : ''}`} onClick={() => setType('transfer')}><i className="fa fa-rotate-left" /> Reembolso</button>
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

        {/* Focusing any real field (description, notes...) brings up the
            system keyboard, so fold our keypad away rather than stack two. */}
        <form onSubmit={handleSubmit} onFocusCapture={e => { if (usePad && e.target.matches('input, select, textarea')) setPadOpen(false) }}>
          {usePad ? (
            <>
              {/* Touch: big amount display driven by our own keypad. */}
              <div className="form-group">
                <label>Cantidad *</label>
                <button
                  type="button"
                  className={`amount-display ${padOpen ? 'active' : ''} ${type}`}
                  onClick={() => setPadOpen(o => !o)}
                  aria-label="Cantidad"
                >
                  <span className={amount ? '' : 'placeholder'}>{formatAmountDisplay(amount)}</span>
                  <small>€</small>
                  {padOpen && <i className="amount-caret" aria-hidden="true" />}
                </button>
                {padOpen && <AmountPad onChange={setAmount} onDone={() => setPadOpen(false)} />}
              </div>
              <div className="form-group">
                <label>Fecha *</label>
                <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="form-row">
              <div className="form-group">
                <label>Cantidad (€) *</label>
                <input className="form-control" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus={autoFocusOnPointer()} />
              </div>
              <div className="form-group">
                <label>Fecha *</label>
                <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Descripción *</label>
            <input className="form-control" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Gasolina, cena cumpleaños…" />
          </div>

          {type === 'expense' && splitMode && (
            <div className="form-group split">
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Repartir entre categorías</label>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setSplitMode(false); setError('') }}>
                  <i className="fa fa-xmark" /> Una sola
                </button>
              </div>
              {splitLines.map((l, idx) => (
                <div key={l.key} className="split-line">
                  <select className="form-control" value={l.categoryId} onChange={e => updateLine(l.key, { categoryId: e.target.value })}>
                    <option value="">Categoría…</option>
                    {expenseCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <input
                    className="form-control split-amount" type="number" inputMode="decimal" step="0.01" min="0"
                    placeholder="0,00" value={l.amount} onChange={e => updateLine(l.key, { amount: e.target.value })}
                  />
                  <button type="button" className="btn btn-icon btn-ghost" title="El resto" aria-label="Poner el resto aquí" onClick={() => fillRest(l.key)}>
                    <i className="fa fa-equals" />
                  </button>
                  {splitLines.length > 2 && (
                    <button type="button" className="btn btn-icon btn-ghost" aria-label="Quitar parte" onClick={() => removeLine(l.key)}>
                      <i className="fa fa-minus" />
                    </button>
                  )}
                </div>
              ))}
              <div className="split-foot">
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setSplitLines(ls => [...ls, newLine()])}>
                  <i className="fa fa-plus" /> Otra categoría
                </button>
                {(() => {
                  const rest = splitRemaining(amount, splitLines)
                  return (
                    <span className={`split-rest ${Math.abs(rest) < 0.005 ? 'ok' : rest < 0 ? 'over' : ''}`}>
                      {Math.abs(rest) < 0.005 ? <><i className="fa fa-check" /> Cuadra</> : rest > 0 ? `Faltan ${rest.toFixed(2).replace('.', ',')} €` : `Sobran ${(-rest).toFixed(2).replace('.', ',')} €`}
                    </span>
                  )
                })()}
              </div>
            </div>
          )}

          {type === 'expense' && !splitMode && (
            <div className="form-group">
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Categoría *</label>
                {!shareOn && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={startSplit}>
                    <i className="fa fa-code-branch" /> Repartir
                  </button>
                )}
              </div>
              <select className="form-control" value={categoryId} onChange={e => { setCategoryId(e.target.value); setAiSuggestion(null) }} aria-label="Categoría">
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

          {type === 'expense' && !splitMode && partnerId && (
            <div className={`share-box ${shareOn ? 'on' : ''}`}>
              <div className="sb-row share-toggle" onClick={() => setShareOn(o => !o)} role="switch" aria-checked={shareOn}>
                <span className="sb-label"><i className="fa fa-user-group" /> Compartido con {partnerName}</span>
                <div className={`switch ${shareOn ? 'on' : ''}`}><div className="switch-knob" /></div>
              </div>
              {shareOn && (
                <div className="share-body">
                  <div className="tabs" style={{ marginBottom: 10 }}>
                    <button type="button" className={`tab ${shareMode === 'half' ? 'active' : ''}`} onClick={() => setShareMode('half')}>A medias</button>
                    <button type="button" className={`tab ${shareMode === 'custom' ? 'active' : ''}`} onClick={() => setShareMode('custom')}>Otra parte</button>
                    <button type="button" className={`tab ${shareMode === 'all' ? 'active' : ''}`} onClick={() => setShareMode('all')}>Todo suyo</button>
                  </div>
                  {shareMode === 'custom' && (
                    <input className="form-control mb-2" type="number" inputMode="decimal" step="0.01" min="0"
                      placeholder={`Parte de ${partnerName} (€)`} value={shareCustom} onChange={e => setShareCustom(e.target.value)} />
                  )}
                  <div className="share-split">
                    <div><span>Tu parte</span><strong>{theirPart != null && amount ? fmt(Math.max(0, parseFloat(amount) - theirPart)) : '—'}</strong></div>
                    <div><span>{partnerName}</span><strong>{theirPart != null ? fmt(theirPart) : '—'}</strong></div>
                  </div>
                  <p className="form-hint">Pagas tú el total; a tu presupuesto solo cuenta tu parte y la de {partnerName} queda pendiente hasta que saldéis.</p>
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
              {incomeType === 'from-savings' && (
                <div className="alert alert-info" style={{ marginTop: 8 }}>
                  <i className="fa fa-circle-info" />
                  <div>Al continuar, podrás repartir este importe (dinero de tus ahorros) entre tus botes y categorías de ahorro/inversión, compensándolos.</div>
                </div>
              )}
            </div>
          )}

          {type === 'transfer' && (
            <div className="form-group">
              <label>Gasto que compensa (opcional)</label>
              {linkedExpense ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--e50)', border: '1px solid var(--e100)' }}>
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{linkedExpense.description}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                      {new Date(linkedExpense.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {linkedExpense.amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <button type="button" onClick={() => { setLinkedExpenseId(null); setExpenseSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>
                    <i className="fa fa-xmark" />
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-control"
                    value={expenseSearch}
                    onChange={e => setExpenseSearch(e.target.value)}
                    placeholder="Buscar gasto…"
                  />
                  {(expenseSearch || filteredExpenses.length > 0) && (
                    <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2 }}>
                      {filteredExpenses.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>Sin resultados</div>
                      ) : filteredExpenses.slice(0, 12).map(t => (
                        <div
                          key={t.id}
                          onClick={() => { setLinkedExpenseId(t.id); setExpenseSearch('') }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '.5px solid var(--sep)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--g50)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {t.categories?.name ? ` · ${t.categories.name}` : ''}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--r5)', flexShrink: 0 }}>-{t.amount.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €</div>
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
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {type === 'income' && DISTRIBUTED_INCOME_TYPES.includes(incomeType)
                ? <><i className="fa fa-arrow-right" /> Continuar al reparto</>
                : <><i className="fa fa-check" /> {saving ? 'Guardando…' : 'Guardar'}</>}
            </button>
          </div>
        </form>
      </div>

      {showExtraPaymentModal && (
        <ExtraPaymentModal
          kind={incomeType}
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
