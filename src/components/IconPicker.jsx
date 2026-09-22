import React, { useEffect, useMemo, useRef, useState } from 'react'
import { searchEmoji } from '../lib/emoji'
import { haptic, autoFocusOnPointer } from '../lib/ui'

// Emoji picker: a button showing the current icon; tapping it opens a
// panel with a search box ("gasolina", "perro"…) and the grouped grid.
// Any emoji can still be typed or pasted in the box.
export default function IconPicker({ value, onChange, label = 'Icono' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const groups = useMemo(() => searchEmoji(query), [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const pick = (e) => { haptic('select'); onChange(e); setOpen(false); setQuery('') }
  // A typed/pasted emoji (anything that isn't plain letters) is taken as the icon.
  const typed = query.trim()
  const typedIsEmoji = typed && /\p{Extended_Pictographic}/u.test(typed)

  return (
    <div className="icon-picker" ref={ref}>
      <button type="button" className="ip-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${label}: ${value || 'ninguno'}. Cambiar`}>
        <span className="ip-current">{value || '＋'}</span>
        <i className="fa fa-chevron-down" />
      </button>
      {open && (
        <div className="ip-panel" role="dialog" aria-label="Elegir icono">
          <div className="ip-search">
            <i className="fa fa-magnifying-glass" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar: comida, coche, perro…"
              autoFocus={autoFocusOnPointer()} aria-label="Buscar icono" />
          </div>
          <div className="ip-grid-wrap">
            {typedIsEmoji && (
              <button type="button" className="ip-typed" onClick={() => pick([...typed].slice(0, 2).join(''))}>
                Usar {typed}
              </button>
            )}
            {groups.map(g => (
              <div key={g.title}>
                <div className="ip-group">{g.title}</div>
                <div className="ip-grid">
                  {g.items.map(([e, words]) => (
                    <button key={e} type="button" className={`ip-emoji ${value === e ? 'on' : ''}`} onClick={() => pick(e)} title={words.split(' ')[0]}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && !typedIsEmoji && <div className="ip-empty">Sin resultados. También puedes pegar cualquier emoji.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
