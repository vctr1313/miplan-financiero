import React, { useState } from 'react'
import { useApp } from '../App'
import { upsertSavingGoal, deleteSavingGoal } from '../lib/supabase'
import { fmt, fmtShort } from '../lib/finance'

const PRESET_ICONS = ['✈️', '🚗', '🛡️', '💍', '🎓', '🏖️', '👶', '💻', '🎯']

export default function SavingGoals() {
  const { savingGoals, refresh } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta meta de ahorro?')) return
    await deleteSavingGoal(id)
    refresh()
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h2>🎯 Mis metas de ahorro</h2><p>Más allá de la casa: viajes, coche, fondo de emergencia…</p></div>
          <button className="btn btn-primary" onClick={() => { setEditingGoal(null); setShowModal(true) }}>
            <i className="fa fa-plus" /> Nueva meta
          </button>
        </div>
      </div>

      {savingGoals.length === 0 ? (
        <div className="card text-center" style={{ padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
          <p className="text-sm text-muted mb-3">Aún no tienes metas de ahorro adicionales.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <i className="fa fa-plus" /> Crear tu primera meta
          </button>
        </div>
      ) : (
        <div className="grid-2">
          {savingGoals.map(g => (
            <GoalCard key={g.id} goal={g} onEdit={() => { setEditingGoal(g); setShowModal(true) }} onDelete={() => handleDelete(g.id)} />
          ))}
        </div>
      )}

      {showModal && (
        <GoalModal goal={editingGoal} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}

function GoalCard({ goal, onEdit, onDelete }) {
  const pct = goal.target > 0 ? Math.min(100, goal.saved / goal.target * 100) : 0
  const remaining = goal.target - goal.saved
  let daysLeft = null
  if (goal.target_date) {
    daysLeft = Math.ceil((new Date(goal.target_date) - new Date()) / 86400000)
  }

  return (
    <div className="card" style={{ borderTop: `3px solid ${goal.color}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 26 }}>{goal.icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{goal.name}</div>
            {goal.target_date && (
              <div className="text-xs text-muted">
                {daysLeft > 0 ? `${daysLeft} días restantes` : daysLeft === 0 ? 'Hoy es el día' : `Venció hace ${Math.abs(daysLeft)} días`}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onEdit}><i className="fa fa-pencil" /></button>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onDelete}><i className="fa fa-trash" /></button>
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: goal.color }}>{fmtShort(goal.saved)}</div>
      <div className="text-xs text-muted mb-2">de {fmtShort(goal.target)} objetivo</div>
      <div className="progress-bar" style={{ height: 7 }}>
        <div className="progress-fill" style={{ width: pct + '%', background: goal.color }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted">{Math.round(pct)}% completado</span>
        {remaining > 0 && <span className="text-xs text-muted">Faltan {fmt(remaining)}</span>}
      </div>
    </div>
  )
}

function GoalModal({ goal, onClose }) {
  const { profile, refresh } = useApp()
  const [name, setName] = useState(goal?.name || '')
  const [icon, setIcon] = useState(goal?.icon || '🎯')
  const [target, setTarget] = useState(goal?.target || '')
  const [saved, setSaved] = useState(goal?.saved || 0)
  const [targetDate, setTargetDate] = useState(goal?.target_date || '')
  const [color, setColor] = useState(goal?.color || '#6366f1')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !target) { alert('Nombre y objetivo son obligatorios'); return }
    setSaving(true)
    try {
      await upsertSavingGoal({
        id: goal?.id,
        household_id: profile.household_id,
        name: name.trim(), icon, color,
        target: parseFloat(target), saved: parseFloat(saved) || 0,
        target_date: targetDate || null,
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
        <h3 className="modal-title">{goal ? 'Editar meta' : 'Nueva meta de ahorro'}</h3>

        <div className="form-group">
          <label>Icono</label>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {PRESET_ICONS.map(ic => (
              <button
                key={ic} type="button"
                onClick={() => setIcon(ic)}
                style={{
                  fontSize: 20, padding: '6px 10px', borderRadius: 8,
                  border: icon === ic ? '2px solid var(--i5)' : '1px solid var(--border)',
                  background: icon === ic ? 'var(--i50)' : 'var(--card)', cursor: 'pointer'
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Nombre *</label>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Viaje a Japón" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Objetivo (€) *</label>
            <input className="form-control" type="number" min="0" value={target} onChange={e => setTarget(e.target.value)} placeholder="3000" />
          </div>
          <div className="form-group">
            <label>Ya ahorrado (€)</label>
            <input className="form-control" type="number" min="0" value={saved} onChange={e => setSaved(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="form-group">
          <label>Fecha objetivo (opcional)</label>
          <input className="form-control" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Color</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 80, height: 36, padding: 2, borderRadius: 6, cursor: 'pointer' }} />
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
