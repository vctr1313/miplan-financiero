import React, { useState } from 'react'
import { useApp } from '../App'
import { upsertCategory, deleteCategory, updateCategoryPct, supabase } from '../lib/supabase'
import { fmt, catBudget, calcPotBalance, getCurrentCycle } from '../lib/finance'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import CategoryDetailModal from '../components/CategoryDetailModal'
import AdjustPotBalanceModal from '../components/AdjustPotBalanceModal'
import ColorSwatches from '../components/ColorSwatches'
import { nextCategoryColor } from '../lib/palette'
ChartJS.register(ArcElement, Tooltip, Legend)

export default function Budget() {
  const { profile, categories, transactions, cycles, pctHistory, refresh } = useApp()
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState(null)
  const [reassignFrom, setReassignFrom] = useState(null)
  const [detailCat, setDetailCat] = useState(null)
  const [adjustingCat, setAdjustingCat] = useState(null)
  const [showRebalance, setShowRebalance] = useState(false)
  // Local draft values for the euro-amount inputs, keyed by category id.
  // These exist separately from c.user_pct (the server-derived value)
  // specifically so the input reflects what the user is actively
  // typing instead of being recalculated from c.user_pct on every
  // render -- without this, each keystroke triggers handleEurChange ->
  // updateCategoryPct -> refresh(), and since refresh() is async, React
  // re-renders with the OLD c.user_pct before the new one round-trips
  // back from Supabase, visually resetting whatever was just typed and
  // making the field feel broken/unresponsive after the first digit.
  const [eurDrafts, setEurDrafts] = useState({})

  const salary = profile?.salary || 0
  const cycle = getCurrentCycle(cycles)
  const cycleTx = cycle
    ? transactions.filter(t => new Date(t.date) >= cycle.start && new Date(t.date) <= cycle.end)
    : []

  // Per-category net reimbursements: transfers in this cycle with a
  // linked_expense_id reduce the net spend of that expense's category.
  const reimbByCat = {}
  const allExpenseById = {}
  transactions.forEach(t => { if (t.type === 'expense') allExpenseById[t.id] = t })
  cycleTx.filter(t => t.type === 'transfer' && t.linked_expense_id).forEach(t => {
    const exp = allExpenseById[t.linked_expense_id]
    if (exp?.category_id) reimbByCat[exp.category_id] = (reimbByCat[exp.category_id] || 0) + t.amount
  })

  const totalPct = categories.reduce((s, c) => s + parseFloat(c.user_pct || 0), 0)
  const roundedTotal = Math.round(totalPct * 100) / 100

  const nonSaving = categories.filter(c => c.type !== 'saving')
  const chartData = {
    labels: nonSaving.map(c => c.name),
    datasets: [{
      data: nonSaving.map(c => salary * c.user_pct / 100),
      backgroundColor: nonSaving.map(c => c.color),
      borderWidth: 2,
      borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1c1c1e' : '#fff'
    }]
  }

  const handlePctChange = async (catId, value) => {
    const v = Math.max(0, Math.min(50, parseFloat(value) || 0))
    const rounded = Math.round(v * 100) / 100
    await updateCategoryPct(catId, rounded)
    refresh()
  }

  const handleEurDraftChange = (catId, value) => {
    // Just track what's being typed locally -- no server call yet.
    setEurDrafts(prev => ({ ...prev, [catId]: value }))
  }

  const handleEurConfirm = async (catId, value) => {
    if (!salary) return
    // 8 decimal places of % (matching the category_pct_history/
    // categories.user_pct column precision) so converting back to €
    // reproduces the exact amount typed, to the cent, instead of
    // forcing a few cents of drift -- 2 decimals of % alone isn't
    // enough precision for that round trip (e.g. 95€ on 1800€ salary
    // is 5.2777...%, which rounded to 5.28% becomes 95.04€ back).
    const rawPct = (parseFloat(value) || 0) / salary * 100
    const pct = Math.round(rawPct * 1e8) / 1e8
    const clamped = Math.min(50, Math.max(0, pct))
    await updateCategoryPct(catId, clamped)
    await refresh()
    // Clear the draft now that the server has the new value -- the
    // input falls back to deriving its displayed value from the
    // (now up-to-date) c.user_pct again.
    setEurDrafts(prev => {
      const next = { ...prev }
      delete next[catId]
      return next
    })
  }

  const handleDeleteCat = async (cat) => {
    if (cat.type === 'pot') {
      const balance = calcPotBalance({ category: cat, salary, cycles, transactions, pctHistory })
      if (balance > 0) {
        setReassignFrom({ cat, balance })
        return
      }
    }
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"? Los movimientos existentes quedarán sin categoría.`)) return
    await deleteCategory(cat.id)
    refresh()
  }

  return (
    <div>
      <div className="page-header">
        <h2>Presupuesto</h2>
        <p>Ajusta categorías y porcentajes. Los % recomendados están en Ajustes (solo lectura).</p>
      </div>

      {!salary && (
        <div className="alert alert-warning">
          <i className="fa fa-triangle-exclamation" /> Configura tu sueldo en <strong>Ajustes</strong>.
        </div>
      )}

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="section-header"><h3>Distribución actual</h3></div>
          <div style={{ position: 'relative', height: 220 }}>
            <Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </div>
        <div className="card">
          <div className="section-header"><h3>Estado por categoría</h3></div>
          {categories.map(c => {
            const budget = catBudget(c, salary)
            const spent = Math.max(0, cycleTx.filter(t => t.category_id === c.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0) - (reimbByCat[c.id] || 0))
            const pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0
            const over = spent > budget && budget > 0
            const potBal = c.type === 'pot' ? calcPotBalance({ category: c, salary, cycles, transactions, pctHistory }) : null
            return (
              <div
                key={c.id} className="flex items-center gap-2 tappable"
                style={{ padding: '9px 10px', margin: '0 -10px', borderRadius: 12, borderBottom: '.5px solid var(--sep)' }}
                onClick={() => setDetailCat(c)}
                title="Ver movimientos de esta categoría"
              >
                <div style={{ width: 33, height: 33, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: c.color + '22', color: c.color, flexShrink: 0 }}>{c.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {c.name} {c.type === 'pot' && <span className="badge badge-amber">Bote</span>} {c.type === 'saving' && <span className="badge badge-green">Ahorro</span>}
                  </div>
                  {c.type === 'normal' && (
                    <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%', background: over ? 'var(--r5)' : c.color }} /></div>
                  )}
                  {c.type === 'pot' && (
                    <div className="text-xs mt-1" style={potBal < 0 ? { color: 'var(--r5)' } : { color: 'var(--muted)' }}>
                      🪣 Acumulado: <strong>{fmt(potBal)}</strong>{potBal < 0 ? ' (se recupera con próximas aportaciones)' : ''}
                    </div>
                  )}
                </div>
                <div className="text-right" style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(budget)}/mes</div>
                  <div className="text-xs text-muted">{c.type === 'saving' ? 'Reservado' : `${fmt(spent)} gastado`}</div>
                </div>
                {c.type === 'pot' && (
                  <button
                    className="btn btn-icon btn-ghost" title="Ajustar saldo real del bote"
                    onClick={e => { e.stopPropagation(); setAdjustingCat(c) }}
                  >
                    <i className="fa fa-scale-balanced" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card mb-4">
        <div className="section-header">
          <h3>Porcentajes</h3>
          <div className="flex items-center gap-2">
            {roundedTotal !== 100 && totalPct > 0 && (
              <button className="btn btn-sm btn-outline" onClick={() => setShowRebalance(true)}>
                <i className="fa fa-scale-balanced" /> Equilibrar a 100%
              </button>
            )}
            <span className={`badge ${roundedTotal === 100 ? 'badge-green' : roundedTotal > 100 ? 'badge-red' : 'badge-amber'}`}>
              Total: {roundedTotal}%
            </span>
          </div>
        </div>
        {categories.map(c => {
          // The stored % can carry up to 8 decimal places now (see
          // handleEurConfirm below), so it can exactly reproduce
          // whatever € amount was typed -- but nobody wants to read
          // "5.27777778" in the % box, so round it for display only;
          // the full-precision value is untouched unless this field
          // itself is edited directly.
          const displayPct = Math.round((parseFloat(c.user_pct) || 0) * 100) / 100
          return (
          <div key={c.id} className="flex items-center gap-2" style={{ marginBottom: 9, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 140, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 15 }}>{c.icon}</span> {c.name}
            </div>
            <input
              type="range" min="0" max="50" step="0.1" value={displayPct}
              onChange={e => handlePctChange(c.id, e.target.value)}
              style={{ flex: 1, minWidth: 80 }}
            />
            <input
              type="number" min="0" max="50" step="0.1" value={displayPct}
              onChange={e => handlePctChange(c.id, e.target.value)}
              style={{ width: 60, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12.5, fontWeight: 600, background: 'var(--inp)', color: 'var(--text)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
            <input
              type="number" min="0" step="0.01"
              value={
                eurDrafts[c.id] !== undefined
                  ? eurDrafts[c.id]
                  : (salary > 0 ? Math.round(salary * c.user_pct / 100 * 100) / 100 : '')
              }
              disabled={!salary}
              onChange={e => handleEurDraftChange(c.id, e.target.value)}
              onBlur={e => handleEurConfirm(c.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              placeholder="€"
              style={{ width: 80, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12.5, fontWeight: 600, background: 'var(--inp)', color: 'var(--text)', textAlign: 'right' }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>€</span>
            <button className="btn btn-icon btn-ghost" onClick={() => { setEditingCat(c); setShowCatModal(true) }}>
              <i className="fa fa-pencil" />
            </button>
            <button className="btn btn-icon btn-ghost" onClick={() => handleDeleteCat(c)}>
              <i className="fa fa-trash" />
            </button>
          </div>
          )
        })}
        <button className="btn btn-outline w-full mt-2" onClick={() => { setEditingCat(null); setShowCatModal(true) }}>
          <i className="fa fa-plus" /> Nueva categoría
        </button>
      </div>

      {showCatModal && (
        <CategoryModal
          category={editingCat}
          onClose={() => setShowCatModal(false)}
          salary={salary}
        />
      )}

      {reassignFrom && (
        <ReassignModal
          fromCat={reassignFrom.cat}
          balance={reassignFrom.balance}
          categories={categories.filter(c => c.type === 'pot' && c.id !== reassignFrom.cat.id)}
          onClose={() => setReassignFrom(null)}
        />
      )}

      {detailCat && (
        <CategoryDetailModal category={detailCat} onClose={() => setDetailCat(null)} />
      )}

      {adjustingCat && (
        <AdjustPotBalanceModal category={adjustingCat} onClose={() => setAdjustingCat(null)} />
      )}

      {showRebalance && (
        <RebalanceModal
          categories={categories}
          salary={salary}
          totalPct={totalPct}
          onClose={() => setShowRebalance(false)}
        />
      )}
    </div>
  )
}

function CategoryModal({ category, onClose, salary }) {
  const { profile, categories, refresh } = useApp()
  const [icon, setIcon] = useState(category?.icon || '🎯')
  const [name, setName] = useState(category?.name || '')
  const [type, setType] = useState(category?.type || 'normal')
  const [color, setColor] = useState(() => category?.color || nextCategoryColor(categories.map(c => c.color)))
  const [pct, setPct] = useState(category?.user_pct ?? 5)
  // Which of the two running totals in Mi Casa a saving category
  // feeds. Only meaningful for type='saving'.
  const [savingBucket, setSavingBucket] = useState(category?.saving_bucket || 'house')
  const [saving, setSaving] = useState(false)

  // Local draft for the € input, same reasoning as Budget()'s
  // eurDrafts: shows exactly what's being typed instead of a value
  // recomputed from `pct`, which would otherwise fight typing of
  // decimals (e.g. "95." briefly parsing to the same pct as "95").
  const [eurDraft, setEurDraft] = useState(undefined)
  const eurValue = eurDraft !== undefined
    ? eurDraft
    : (salary > 0 ? Math.round(salary * pct / 100 * 100) / 100 : '')

  const handleEurChange = (value) => {
    setEurDraft(value)
    if (!salary) return
    // 8 decimals of % so this € figure round-trips exactly -- see the
    // matching comment on Budget()'s handleEurConfirm.
    const rawPct = (parseFloat(value) || 0) / salary * 100
    const p = Math.round(rawPct * 1e8) / 1e8
    setPct(Math.min(50, Math.max(0, p)))
  }

  // `pct` itself can carry up to 8 decimal places (set via the € field
  // above), which round-trips € exactly but reads as noise in a % box
  // -- round only what's displayed here; saving still uses the
  // full-precision `pct` state untouched.
  const displayPct = Math.round((parseFloat(pct) || 0) * 100) / 100

  const handleSave = async () => {
    if (!name.trim()) { alert('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      await upsertCategory({
        id: category?.id,
        household_id: profile.household_id,
        name: name.trim(), icon, type, color,
        def_pct: parseFloat(pct), user_pct: parseFloat(pct),
        saving_bucket: type === 'saving' ? savingBucket : null,
        sort_order: category?.sort_order ?? 99
      })
      await refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <h3 className="modal-title">{category ? 'Editar categoría' : 'Nueva categoría'}</h3>
        <div className="form-group">
          <label>Emoji</label>
          <input className="form-control" value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} style={{ fontSize: 20, maxWidth: 80 }} />
        </div>
        <div className="form-group">
          <label>Nombre *</label>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Mascotas" />
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <select className="form-control" value={type} onChange={e => setType(e.target.value)}>
            <option value="normal">Normal (gasto mensual)</option>
            <option value="pot">Bote (acumula si no se gasta)</option>
            <option value="saving">Ahorro / Inversión</option>
          </select>
        </div>
        {type === 'saving' && (
          <div className="form-group">
            <label>Destino del ahorro</label>
            <select className="form-control" value={savingBucket} onChange={e => setSavingBucket(e.target.value)}>
              <option value="house">🏠 Meta de la casa</option>
              <option value="invest">📈 Total invertido</option>
            </select>
            <div className="form-hint">
              A cuál de los dos totales de <strong>Mi Casa</strong> suma lo que repartas en esta categoría.
            </div>
          </div>
        )}
        <div className="form-group">
          <label>Color</label>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <div className="form-group">
          <label>% del sueldo</label>
          <div className="flex items-center gap-2">
            <input className="form-control" type="number" min="0" max="50" step="0.01" value={displayPct} onChange={e => { setPct(e.target.value); setEurDraft(undefined) }} style={{ maxWidth: 100 }} />
            <span className="text-xs text-muted">%</span>
            <input
              className="form-control" type="number" min="0" step="0.01"
              value={eurValue} disabled={!salary}
              onChange={e => handleEurChange(e.target.value)}
              onBlur={() => setEurDraft(undefined)}
              placeholder="€" style={{ maxWidth: 100 }}
            />
            <span className="text-xs text-muted">€{!salary ? ' (configura tu sueldo)' : ''}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <i className="fa fa-check" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function ReassignModal({ fromCat, balance, categories, onClose }) {
  const { refresh } = useApp()
  const [target, setTarget] = useState(categories[0]?.id || '')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!target) return
    setSaving(true)
    try {
      // Move all transactions from fromCat to the chosen target category
      await supabase.from('transactions').update({ category_id: target }).eq('category_id', fromCat.id)
      await deleteCategory(fromCat.id)
      await refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!categories.length) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <h3 className="modal-title">No hay otros botes</h3>
          <p className="text-sm text-muted mb-3">
            No tienes otro bote al que mover el saldo de {fmt(balance)}. Crea otro bote primero o cancela.
          </p>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <h3 className="modal-title">Reasignar saldo del bote</h3>
        <p className="text-sm text-muted mb-3">
          "{fromCat.name}" tiene saldo acumulado. ¿A qué otro bote quieres moverlo?
        </p>
        <div className="form-group">
          <label>Saldo a reasignar</label>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--a6)' }}>{fmt(balance)}</div>
        </div>
        <div className="form-group">
          <label>Destino</label>
          <select className="form-control" value={target} onChange={e => setTarget(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            <i className="fa fa-arrow-right" /> Reasignar y eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

// Scales every category proportionally so the percentages add up to
// exactly 100%. Proportional (rather than, say, dumping the remainder
// on one category) is the only rule that preserves the relative
// weighting the user already chose -- it answers "same plan, but
// adding up" instead of quietly re-prioritising for them.
function RebalanceModal({ categories, salary, totalPct, onClose }) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const factor = totalPct > 0 ? 100 / totalPct : 0
  const rows = categories.map(c => {
    const from = parseFloat(c.user_pct) || 0
    // 8 decimals, matching the column precision used everywhere else.
    const to = Math.round(from * factor * 1e8) / 1e8
    return { cat: c, from, to, clamped: to > 50 }
  })
  // 50 is the per-category cap the sliders enforce; if scaling would
  // push anything past it the result wouldn't be reachable by hand
  // either, so say so instead of silently producing a different total.
  const anyClamped = rows.some(r => r.clamped)

  const handleConfirm = async () => {
    setSaving(true)
    setError('')
    try {
      for (const r of rows) {
        if (Math.abs(r.to - r.from) < 1e-8) continue
        await updateCategoryPct(r.cat.id, r.to)
      }
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
      <div className="modal" style={{ maxWidth: 480 }}>
        <h3 className="modal-title">Equilibrar a 100%</h3>
        <div className="alert alert-info">
          <i className="fa fa-circle-info" />
          <div>
            Tus categorías suman <strong>{Math.round(totalPct * 100) / 100}%</strong>. Se ajustarán todas
            en la misma proporción para llegar a 100%, manteniendo el peso relativo entre ellas.
          </div>
        </div>

        {anyClamped && (
          <div className="alert alert-warning">
            <i className="fa fa-triangle-exclamation" />
            <div>Alguna categoría superaría el máximo del 50%. Ajusta esas a mano antes de equilibrar.</div>
          </div>
        )}

        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {rows.map(r => (
            <div key={r.cat.id} className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '.5px solid var(--sep)' }}>
              <span style={{ fontSize: 16, width: 24 }}>{r.cat.icon}</span>
              <span style={{ flex: 1, fontSize: 13.5 }}>{r.cat.name}</span>
              <span className="text-xs text-muted tnum">
                {Math.round(r.from * 100) / 100}%
                {salary > 0 && <> · {fmt(salary * r.from / 100)}</>}
              </span>
              <i className="fa fa-arrow-right text-xs" style={{ color: 'var(--g300)' }} />
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, minWidth: 92, textAlign: 'right', color: r.clamped ? 'var(--r5)' : 'var(--text)' }}>
                {Math.round(r.to * 100) / 100}%
                {salary > 0 && <> · {fmt(salary * r.to / 100)}</>}
              </span>
            </div>
          ))}
        </div>

        {error && <div className="alert alert-danger mt-2">{error}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || anyClamped}>
            <i className="fa fa-check" /> {saving ? 'Ajustando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
