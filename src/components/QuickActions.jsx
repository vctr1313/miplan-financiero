import React, { useEffect, useState } from 'react'
import { haptic } from '../lib/ui'

// The round "+" beside the tab bar (bottom-right on desktop). Tapping
// it fans out the quick actions above it; the + turns into an ×.
export default function QuickActions({ actions, onPick }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggle = () => { haptic('select'); setOpen(o => !o) }
  const pick = (a) => { setOpen(false); onPick(a) }

  return (
    <>
      {open && <div className="qa-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="qa-menu" role="menu">
          {actions.map((a, i) => (
            <button key={a.id} type="button" role="menuitem" className="qa-item"
              style={{ animationDelay: `${(actions.length - 1 - i) * 35}ms` }} onClick={() => pick(a)}>
              <span className="qa-label">{a.label}</span>
              <span className="qa-icon" style={{ background: a.color }}><i className={`fa ${a.icon}`} /></span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className={`qa-fab ${open ? 'open' : ''}`} onClick={toggle}
        aria-label={open ? 'Cerrar acciones rápidas' : 'Añadir'} aria-expanded={open} aria-haspopup="menu">
        <i className="fa fa-plus" />
      </button>
    </>
  )
}
