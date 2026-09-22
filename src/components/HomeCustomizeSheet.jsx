import React from 'react'
import { HOME_SECTIONS, moveSection, toggleSection, resetLayout } from '../lib/homeLayout'
import { haptic } from '../lib/ui'

const meta = Object.fromEntries(HOME_SECTIONS.map(s => [s.id, s]))

// "Personalizar inicio": show/hide each home card and move it up or
// down. Changes apply live behind the sheet.
export default function HomeCustomizeSheet({ layout, onChange, onClose }) {
  const change = (next) => { haptic('select'); onChange(next) }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <h3 className="modal-title">Personalizar inicio</h3>
        <p className="text-sm text-muted mb-3">Elige qué ver y en qué orden. Se guarda en este dispositivo.</p>
        <div className="hc-list">
          {layout.map((e, i) => (
            <div key={e.id} className={`hc-row ${e.hidden ? 'off' : ''}`}>
              <span className="hc-icon"><i className={`fa ${meta[e.id].icon}`} /></span>
              <span className="hc-label">{meta[e.id].label}</span>
              <button type="button" className="hc-move" disabled={i === 0} aria-label={`Subir ${meta[e.id].label}`}
                onClick={() => change(moveSection(layout, e.id, -1))}><i className="fa fa-chevron-up" /></button>
              <button type="button" className="hc-move" disabled={i === layout.length - 1} aria-label={`Bajar ${meta[e.id].label}`}
                onClick={() => change(moveSection(layout, e.id, 1))}><i className="fa fa-chevron-down" /></button>
              <div className={`switch ${e.hidden ? '' : 'on'}`} role="switch" aria-checked={!e.hidden} tabIndex={0}
                aria-label={`Mostrar ${meta[e.id].label}`}
                onClick={() => change(toggleSection(layout, e.id))}
                onKeyDown={k => (k.key === ' ' || k.key === 'Enter') && (k.preventDefault(), change(toggleSection(layout, e.id)))}>
                <div className="switch-knob" />
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => change(resetLayout())}>Restablecer</button>
          <button type="button" className="btn btn-primary" onClick={onClose}><i className="fa fa-check" /> Hecho</button>
        </div>
      </div>
    </div>
  )
}
