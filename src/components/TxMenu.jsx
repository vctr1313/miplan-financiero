import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../App'
import { addTransaction, updateTransaction, shareExistingExpense } from '../lib/supabase'
import { fmt, toLocalISODate } from '../lib/finance'
import { toast, alertDialog } from '../lib/dialog'
import { haptic } from '../lib/ui'

// The long-press (or right-click) menu of a movement: edit, duplicate,
// move to another category, share with the partner, delete. On phones
// it's an action sheet under a preview of the row; with a mouse, a
// small menu at the pointer.
export default function TxMenu({ tx, at, onClose, onEdit, onDelete }) {
  const { categories, profile, partnerSummary, shared, refresh } = useApp()
  const [view, setView] = useState('main') // 'main' | 'move' | 'share'
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const sheet = !at

  const partnerName = partnerSummary?.partner_name || 'tu pareja'
  const isExpense = tx.type === 'expense'
  const isShareTransfer = shared.expenses.some(s => s.share_tx_id === tx.id)
  const alreadyShared = shared.expenses.some(s => s.expense_tx_id === tx.id)
  const canDuplicate = (isExpense && !tx.split_group) || (tx.type === 'income' && !tx.is_salary)
  const canMove = isExpense && !isShareTransfer
  const canShare = isExpense && profile?.partner_id && tx.user_id === profile.id && !alreadyShared && !tx.split_group
  const moveTargets = categories.filter(c => c.type !== 'saving' && c.id !== tx.category_id)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep a pointer menu inside the window.
  useLayoutEffect(() => {
    if (sheet || !menuRef.current) return
    const r = menuRef.current.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)),
    })
  }, [sheet, at, view])

  const run = (fn) => async () => {
    onClose()
    try { await fn() } catch (err) {
      haptic('error')
      alertDialog({ icon: 'fa-triangle-exclamation', title: 'No se pudo completar', message: err.message })
    }
  }
  const duplicate = run(async () => {
    await addTransaction({
      type: tx.type, amount: tx.amount, date: toLocalISODate(new Date()), description: tx.description,
      notes: tx.notes || null, category_id: tx.category_id, is_salary: false,
    })
    haptic('success')
    await refresh()
    toast({ text: `Duplicado con fecha de hoy`, icon: 'fa-clone' })
  })
  const moveTo = (c) => run(async () => {
    await updateTransaction(tx.id, { category_id: c.id })
    haptic('success')
    await refresh()
    toast({ text: `Movido a ${c.icon || ''} ${c.name}`, icon: 'fa-folder-open' })
  })
  const shareAs = (part) => run(async () => {
    await shareExistingExpense({ tx, partnerShare: part, partnerId: profile.partner_id, partnerName })
    haptic('success')
    await refresh()
    toast({ text: `Compartido: ${partnerName} te debe ${fmt(part)}`, icon: 'fa-user-group' })
  })

  const Item = ({ icon, label, onClick, danger, chevron }) => (
    <button type="button" role="menuitem" className={`cm-item ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <i className={`fa ${chevron ? 'fa-chevron-right' : icon}`} />
    </button>
  )

  const back = <Item icon="fa-chevron-left" label="Atrás" onClick={() => setView('main')} />
  let items
  if (view === 'move') {
    items = (
      <>
        {back}
        <div className="cm-scroll">
          {moveTargets.map(c => <Item key={c.id} icon="fa-folder" label={`${c.icon || ''} ${c.name}`} onClick={moveTo(c)} />)}
        </div>
      </>
    )
  } else if (view === 'share') {
    const half = Math.round(tx.amount * 50) / 100
    items = (
      <>
        {back}
        <Item icon="fa-divide" label={`A medias · ${partnerName} ${fmt(half)}`} onClick={shareAs(half)} />
        <Item icon="fa-user" label={`Todo suyo · ${fmt(tx.amount)}`} onClick={shareAs(tx.amount)} />
      </>
    )
  } else {
    items = (
      <>
        {onEdit && <Item icon="fa-pencil" label="Editar" onClick={() => { onClose(); onEdit() }} />}
        {canDuplicate && <Item icon="fa-clone" label="Duplicar hoy" onClick={duplicate} />}
        {canMove && moveTargets.length > 0 && <Item label="Mover a categoría" chevron onClick={() => setView('move')} />}
        {canShare && <Item label={`Compartir con ${partnerName}`} chevron onClick={() => setView('share')} />}
        <Item icon="fa-trash" label="Eliminar" danger onClick={() => { onClose(); onDelete() }} />
      </>
    )
  }

  // Portalled to <body>: a row sits inside animated/transformed cards,
  // which would otherwise trap this fixed-position layer inside them.
  return createPortal(
    <div className={`cm-overlay ${sheet ? 'sheet' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}
      onContextMenu={e => { e.preventDefault(); onClose() }}>
      {sheet && (
        <div className="cm-preview">
          <span className="cm-preview-icon">{tx.categories?.icon || (tx.type === 'income' ? '💰' : '💸')}</span>
          <span className="cm-preview-text">
            <strong>{tx.description}</strong>
            <small>{new Date(tx.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}{tx.categories?.name ? ` · ${tx.categories.name}` : ''}</small>
          </span>
          <strong className={`tx-amount ${tx.type}`}>{fmt(tx.amount)}</strong>
        </div>
      )}
      <div ref={menuRef} className="cm-menu" role="menu" key={view}
        style={sheet ? undefined : { left: pos?.left ?? at.x, top: pos?.top ?? at.y, visibility: pos ? 'visible' : 'hidden' }}>
        {items}
      </div>
    </div>,
    document.body
  )
}
