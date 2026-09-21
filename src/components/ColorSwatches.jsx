import React from 'react'
import { CATEGORY_COLORS } from '../lib/palette'

// Replaces the native <input type="color">, which let any colour in and
// is what produced the clashing category palette. A value that isn't
// in the set (a category created before this existed) is still shown
// as selected, as its own extra swatch, so editing never silently
// changes it.
export default function ColorSwatches({ value, onChange }) {
  const known = CATEGORY_COLORS.some(c => c.value.toLowerCase() === (value || '').toLowerCase())
  const options = known || !value ? CATEGORY_COLORS : [...CATEGORY_COLORS, { name: 'Actual', value }]
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {options.map(c => {
        const selected = (value || '').toLowerCase() === c.value.toLowerCase()
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c.name}
            title={c.name}
            className={`swatch ${selected ? 'selected' : ''}`}
            style={{ '--sw': c.value }}
            onClick={() => onChange(c.value)}
          />
        )
      })}
    </div>
  )
}
