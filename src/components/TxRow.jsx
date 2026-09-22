import React, { useRef, useState } from 'react'
import { fmt } from '../lib/finance'
import { haptic } from '../lib/ui'

// A movement row. On touch it swipes left (Mail-style) to reveal Edit
// and Delete; tapping the row edits it. On a pointer device the same
// actions appear as small buttons on hover instead -- the swipe code
// ignores mouse input entirely.
//
// Gesture notes: `touch-action: pan-y` (in CSS) leaves vertical
// scrolling to the browser, which fires pointercancel the moment it
// takes over -- so a scroll that starts on a row never gets hijacked
// into a half-swipe. Direction is locked after the first ~8px.
// `onSelect`/`selected`: on wide screens a click picks the row for the
// detail panel beside the list instead of opening a dialog.
export default function TxRow({ tx, onDelete, onEdit, onSelect, selected, showUser, reimburseMap, txById, splitInfo }) {
  const cat = tx.categories
  const isNeg = tx.type === 'expense' || tx.type === 'pot-withdrawal'
  const icon = tx.type === 'income' ? '💰' : tx.type === 'transfer' ? '↩️' : cat?.icon || '💸'
  const color = tx.type === 'income' ? '#34c759' : tx.type === 'transfer' ? '#007aff' : cat?.color || '#8e8e93'
  const dateStr = new Date(tx.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  const userName = tx.profiles?.name

  const reimbursed = tx.type === 'expense' ? (reimburseMap?.[tx.id] || 0) : 0
  const linkedExpense = tx.type === 'transfer' && tx.linked_expense_id ? txById?.[tx.linked_expense_id] : null

  const actionsWidth = onEdit ? 148 : 78
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef(null)
  const moved = useRef(false)

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return
    gesture.current = { x: e.clientX, y: e.clientY, base: dx, dir: null }
    moved.current = false
  }
  const onPointerMove = (e) => {
    const g = gesture.current
    if (!g) return
    const mx = e.clientX - g.x
    const my = e.clientY - g.y
    if (!g.dir) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      g.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
    }
    if (g.dir !== 'h') { gesture.current = null; return }
    moved.current = true
    setDragging(true)
    let next = g.base + mx
    // Rubber-band past either end instead of a hard stop.
    if (next > 0) next *= 0.25
    if (next < -actionsWidth) next = -actionsWidth + (next + actionsWidth) * 0.25
    setDx(next)
  }
  const settle = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.dir !== 'h') return
    setDragging(false)
    const open = dx < -actionsWidth * 0.45
    if (open) haptic('select')
    setDx(open ? -actionsWidth : 0)
  }
  const onPointerCancel = () => {
    gesture.current = null
    setDragging(false)
    setDx(d => (d < -actionsWidth * 0.45 ? -actionsWidth : 0))
  }

  const onRowClick = () => {
    if (moved.current) { moved.current = false; return }
    if (dx !== 0) { setDx(0); return }
    if (onSelect) { onSelect(); return }
    // A plain tap edits on touch devices, where there's no hover button.
    if (onEdit && window.matchMedia?.('(hover: none)').matches) onEdit()
  }

  const run = (fn) => () => { setDx(0); fn?.() }

  return (
    <div className={`tx-swipe ${dx < 0 ? 'open' : ''}`}>
      <div className="tx-actions" style={{ width: actionsWidth }} aria-hidden={dx === 0}>
        {onEdit && (
          <button type="button" className="tx-action edit" onClick={run(onEdit)} tabIndex={dx === 0 ? -1 : 0}>
            <i className="fa fa-pencil" /><span>Editar</span>
          </button>
        )}
        <button type="button" className="tx-action delete" onClick={run(onDelete)} tabIndex={dx === 0 ? -1 : 0}>
          <i className="fa fa-trash" /><span>Borrar</span>
        </button>
      </div>

      <div
        className={`tx-row ${selected ? 'selected' : ''}`}
        aria-current={selected || undefined}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={onPointerCancel}
        onClick={onRowClick}
      >
        <div className="tx-icon" style={{ background: color + '22', color }}>{icon}</div>
        <div className="tx-info">
          <div className="tx-desc">{tx.description}</div>
          <div className="tx-meta">
            {dateStr} · {cat?.name || (tx.type === 'income' ? 'Ingreso' : tx.type === 'transfer' ? 'Reembolso' : 'Movimiento')}
            {showUser && userName && <span> · {userName}</span>}
            {tx.split_group && splitInfo?.[tx.split_group] && (
              <span className="tx-split-tag" title="Parte de una compra repartida">
                <i className="fa fa-code-branch" /> parte de {fmt(splitInfo[tx.split_group].total)}
              </span>
            )}
            {linkedExpense && <span style={{ color: 'var(--i5)' }}> · para: {linkedExpense.description}</span>}
            {reimbursed > 0 && (
              <span style={{ color: 'var(--e6)' }}> · devuelto {fmt(reimbursed)} · neto {fmt(tx.amount - reimbursed)}</span>
            )}
          </div>
        </div>
        <div className={`tx-amount ${tx.type}`}>{isNeg ? '-' : '+'}{fmt(tx.amount)}</div>
        {onEdit && (
          <button type="button" className="tx-inline-btn" onClick={e => { e.stopPropagation(); onEdit() }} aria-label="Editar">
            <i className="fa fa-pencil" />
          </button>
        )}
        <button type="button" className="tx-inline-btn" onClick={e => { e.stopPropagation(); onDelete() }} aria-label="Borrar">
          <i className="fa fa-xmark" />
        </button>
      </div>
    </div>
  )
}
