import React, { useEffect, useMemo, useRef, useState } from 'react'
import { searchAll } from '../lib/search'
import { fmt } from '../lib/finance'

// Global search (⌘K / Ctrl+K, or the magnifier in the header). Finds
// screens, actions, categories and movements; ↑/↓ and Enter work.
// `onPick(item)` gets the chosen result -- Layout decides what it does.
export default function Spotlight({ pages, actions, categories, transactions, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  const groups = useMemo(
    () => searchAll(query, { pages, actions, categories, transactions }),
    [query, pages, actions, categories, transactions]
  )
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups])
  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); onPick(flat[active]) }
  }

  let index = -1
  return (
    <div className="spot-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="spot" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="spot-input">
          <i className="fa fa-magnifying-glass" />
          {/* The user asked to search, so opening the keyboard is right here. */}
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Buscar movimientos, categorías, pantallas…" aria-label="Buscar"
            role="combobox" aria-expanded="true" aria-controls="spot-list" aria-autocomplete="list" />
          <button type="button" className="spot-cancel" onClick={onClose}>Cancelar</button>
        </div>
        <div className="spot-list" id="spot-list" role="listbox" ref={listRef}>
          {flat.length === 0 && <div className="spot-empty">Nada coincide con "{query}"</div>}
          {groups.map(g => (
            <div key={g.title} className="spot-group">
              <div className="spot-group-title">{g.title}</div>
              {g.items.map(item => {
                index++
                const i = index
                return (
                  <button key={`${item.kind}-${item.id}`} type="button" role="option"
                    aria-selected={i === active} data-active={i === active}
                    className={`spot-item ${i === active ? 'active' : ''}`}
                    onMouseMove={() => active !== i && setActive(i)} onClick={() => onPick(item)}>
                    <span className="spot-icon" style={item.color ? { background: item.color + '22', color: item.color } : undefined}>
                      {item.emoji || <i className={`fa ${item.icon || 'fa-circle'}`} />}
                    </span>
                    <span className="spot-text">
                      <span className="spot-label">{item.label}</span>
                      {(item.sub || item.tx) && (
                        <span className="spot-sub">
                          {item.tx ? `${new Date(item.tx.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}${item.sub ? ' · ' + item.sub : ''}` : item.sub}
                        </span>
                      )}
                    </span>
                    {item.tx && <span className={`spot-amount ${item.tx.type}`}>{fmt(item.tx.amount)}</span>}
                    {item.kind === 'page' && <i className="fa fa-chevron-right spot-chevron" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="spot-foot"><kbd>↑</kbd><kbd>↓</kbd> moverse · <kbd>↵</kbd> abrir · <kbd>esc</kbd> cerrar</div>
      </div>
    </div>
  )
}
