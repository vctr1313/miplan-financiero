import React, { useState } from 'react'

// Own numeric keypad for entering amounts on phones.
//
// The system keyboard is the wrong tool here: it's a full QWERTY or a
// decimal pad whose separator depends on the phone's locale (',' vs
// '.'), it covers half the sheet, and every open/close reflows the
// dialog. This pad is part of the sheet itself, always uses ',' for
// display, and stores the value with '.' so parseFloat() keeps working
// exactly as it did with the old <input type="number">.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del']

const MAX_INT_DIGITS = 7

export const formatAmountDisplay = (value) => {
  if (!value) return '0'
  const [int, dec] = value.split('.')
  const intFmt = Number(int || 0).toLocaleString('es-ES')
  return dec !== undefined ? `${intFmt},${dec}` : intFmt
}

// Pure: the amount string after pressing `key`. Returns `v` unchanged
// for a press that isn't allowed (third decimal, too many digits...).
export const nextAmount = (v, key) => {
  if (key === 'del') return v.slice(0, -1)
  if (key === ',') return v.includes('.') ? v : (v || '0') + '.'
  const [int, dec] = v.split('.')
  if (dec !== undefined) return dec.length >= 2 ? v : v + key
  if ((int || '').replace(/^0+/, '').length >= MAX_INT_DIGITS) return v
  return int === '0' ? key : v + key
}

export default function AmountPad({ onChange, onDone }) {
  const [pressed, setPressed] = useState(null)

  const press = (key) => {
    // Functional update: each tap builds on the latest value, even if
    // several taps land before React has re-rendered.
    onChange(prev => nextAmount(prev || '', key))
    // Light haptic tick where the platform supports it.
    navigator.vibrate?.(6)
  }

  return (
    <div className="pad" role="group" aria-label="Teclado numérico">
      {KEYS.map(k => (
        <button
          key={k}
          type="button"
          className={`pad-key ${k === 'del' ? 'pad-del' : ''} ${pressed === k ? 'pressed' : ''}`}
          onPointerDown={() => setPressed(k)}
          onPointerUp={() => setPressed(null)}
          onPointerLeave={() => setPressed(null)}
          onClick={() => press(k)}
          aria-label={k === 'del' ? 'Borrar' : k === ',' ? 'Coma decimal' : k}
        >
          {k === 'del' ? <i className="fa fa-delete-left" /> : k}
        </button>
      ))}
      <button type="button" className="pad-done" onClick={onDone}>Listo</button>
    </div>
  )
}
