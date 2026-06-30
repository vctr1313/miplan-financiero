import React, { useState } from 'react'
import { useApp } from '../App'
import { upsertCategory, deleteCategory, updateCategoryPct, supabase } from '../lib/supabase'
import { fmt, catBudget, calcPotBalance, getCurrentCycle } from '../lib/finance'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
ChartJS.register(ArcElement, Tooltip, Legend)

export default function Budget() {
  const { profile, categories, transactions, cycles, refresh } = useApp()
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState(null)
  const [reassignFrom, setReassignFrom] = useState(null)
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

  const totalPct = categories.reduce((s, c) => s + parseFloat(c.user_pct || 0), 0)
  const roundedTotal = Math.round(totalPct * 100) / 100

  const nonSaving = categories.filter(c => c.type !== 'saving')
  const chartData = {
    labels: nonSaving.map(c => c.name),
    datasets: [{
      data: nonSaving.map(c => salary * c.user_pct / 100),
      backgroundColor: nonSaving.map(c => c.color),
      borderWidth: 2,
      borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#181727' : '#fff'
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
    const pct = Math.round((parseFloat(value) || 0) / salary * 10000) / 100
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
      const balance = calcPotBalance({ category: cat, salary, cycles, transactions })
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
            const spent = cycleTx.filter(t => t.category_id === c.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
            const pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0
            const over = spent > budget && budget > 0
            const potBal = c.type === 'pot' ? calcPotBalance({ category: c, salary, cycles, transactions }) : null
            return (
              <div key={c.id} className="flex items-center gap-2" style={{ padding: '9px 0', borderBottom: '1px solid var(--g100)' }}>
                <div style={{ width: 33, height: 33, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: c.color + '22', color: c.color, flexShrink: 0 }}>{c.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {c.name} {c.type === 'pot' && <span className="badge badge-amber">Bote</span>} {c.type === 'saving' && <span className="badge badge-green">Ahorro</span>}
                  </div>
                  {c.type === 'normal' && (
                    <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%', background: over ? 'var(--r5)' : c.color }} /></div>
                  )}
                  {c.type === 'pot' && (
                    <div className="text-xs text-muted mt-1">🪣 Acumulado: <strong>{fmt(potBal)}</strong></div>
                  )}
                </div>
                <div className="text-right" style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(budget)}/mes</div>
                  <div className="text-xs text-muted">{c.type === 'saving' ? 'Reservado' : `${fmt(spent)} gastado`}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card mb-4">
        <div className="section-header">
          <h3>Porcentajes</h3>
          <span className={`badge ${roundedTotal === 100 ? 'badge-green' : roundedTotal > 100 ? 'badge-red' : 'badge-amber'}`}>
            Total: {roundedTotal}%
          </span>
        </div>
        {categories.map(c => (
          <div key={c.id} className="flex items-center gap-2" style={{ marginBottom: 9, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 140, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 15 }}>{c.icon}</span> {c.name}
            </div>
            <input
              type="range" min="0" max="50" step="0.1" value={c.user_pct}
              onChange={e => handlePctChange(c.id, e.target.value)}
              style={{ flex: 1, minWidth: 80 }}
            />
            <input
              type="number" min="0" max="50" step="0.1" value={c.user_pct}
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
        ))}
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
    </div>
  )
}

function CategoryModal({ category, onClose, salary }) {
  const { profile, refresh } = useApp()
  const [icon, setIcon] = useState(category?.icon || '🎯')
  const [name, setName] = useState(category?.name || '')
  const [type, setType] = useState(category?.type || 'normal')
  const [color, setColor] = useState(category?.color || '#6366f1')
  const [pct, setPct] = useState(category?.user_pct ?? 5)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { alert('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      await upsertCategory({
        id: category?.id,
        household_id: profile.household_id,
        name: name.trim(), icon, type, color,
        def_pct: parseFloat(pct), user_pct: parseFloat(pct),
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
        <div className="form-group">
          <label>Color</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 80, height: 36, padding: 2, borderRadius: 6, cursor: 'pointer' }} />
        </div>
        <div className="form-group">
          <label>% del sueldo</label>
          <div className="flex items-center gap-2">
            <input className="form-control" type="number" min="0" max="50" value={pct} onChange={e => setPct(e.target.value)} style={{ maxWidth: 100 }} />
            <span className="text-xs text-muted">{salary > 0 ? fmt(salary * pct / 100) : ''}</span>
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
