// A closed, harmonised set of category colours.
//
// Categories used to get arbitrary hex values (indigo, hot pink, teal,
// grey...) picked independently, so a budget chart looked like a bag
// of highlighters next to the rest of the interface. These are all
// drawn from the iOS system palette, which shares a common saturation
// and lightness, so any subset of them still reads as one family.
export const CATEGORY_COLORS = [
  { name: 'Azul',     value: '#007aff' },
  { name: 'Índigo',   value: '#5856d6' },
  { name: 'Morado',   value: '#af52de' },
  { name: 'Rosa',     value: '#ff2d55' },
  { name: 'Rojo',     value: '#ff3b30' },
  { name: 'Naranja',  value: '#ff9500' },
  { name: 'Ámbar',    value: '#ffcc00' },
  { name: 'Verde',    value: '#34c759' },
  { name: 'Menta',    value: '#00c7be' },
  { name: 'Cian',     value: '#32ade6' },
  { name: 'Marrón',   value: '#a2845e' },
  { name: 'Gris',     value: '#8e8e93' },
]

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[0].value

// Deterministic pick so a brand-new category doesn't land on the same
// colour as the one created just before it.
export const nextCategoryColor = (usedColors = []) => {
  const used = new Set(usedColors.map(c => (c || '').toLowerCase()))
  const free = CATEGORY_COLORS.find(c => !used.has(c.value))
  return (free || CATEGORY_COLORS[used.size % CATEGORY_COLORS.length]).value
}

// Translucent version of any category colour, for chips and icon
// backgrounds. Accepts the #rrggbb the colour picker produces.
export const tint = (hex, alpha = 0.14) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return `rgba(142,142,147,${alpha})`
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16))
  return `rgba(${r},${g},${b},${alpha})`
}
