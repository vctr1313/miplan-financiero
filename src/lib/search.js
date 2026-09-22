// The global search (Spotlight): one box that finds screens, actions,
// categories and movements. Pure, so it's testable without the UI.

// Case- and accent-insensitive: "mas" finds "Más", "cafe" finds "Café".
export const normalize = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Every word typed must appear somewhere in the item's text, in any
// order: "super sept" finds "Supermercado" from September.
const matcher = (query) => {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return (text) => {
    const hay = normalize(text)
    return terms.every(t => hay.includes(t))
  }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Amounts are searchable as typed in Spain ("12,99") or with a dot.
const amountText = (n) => {
  const fixed = Number(n).toFixed(2)
  return `${fixed} ${fixed.replace('.', ',')} ${Math.round(Number(n))}`
}

export function searchAll(query, { pages = [], actions = [], categories = [], transactions = [] }, limit = 8) {
  const q = normalize(query)
  if (!q) {
    return [
      { title: 'Acciones', items: actions.map(a => ({ ...a, kind: 'action' })) },
      { title: 'Ir a', items: pages.map(p => ({ ...p, kind: 'page' })) },
    ].filter(g => g.items.length)
  }
  const match = matcher(q)

  const actionHits = actions.filter(a => match(`${a.label} ${a.keywords || ''}`)).map(a => ({ ...a, kind: 'action' }))
  const pageHits = pages.filter(p => match(`${p.label} ${p.keywords || ''}`)).map(p => ({ ...p, kind: 'page' }))
  const categoryHits = categories
    .filter(c => match(c.name))
    .map(c => ({
      kind: 'category', id: c.id, label: c.name, emoji: c.icon, color: c.color,
      sub: c.type === 'pot' ? 'Bote' : c.type === 'saving' ? 'Ahorro' : 'Categoría',
    }))
  const txHits = transactions
    .filter(t => {
      const d = new Date(t.date)
      return match(`${t.description} ${t.categories?.name || ''} ${t.notes || ''} ${amountText(t.amount)} ${MONTHS[d.getMonth()] || ''}`)
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map(t => ({ kind: 'movement', id: t.id, label: t.description, tx: t, emoji: t.categories?.icon, sub: t.categories?.name }))

  return [
    { title: 'Acciones', items: actionHits },
    { title: 'Ir a', items: pageHits },
    { title: 'Categorías', items: categoryHits.slice(0, limit) },
    { title: 'Movimientos', items: txHits },
  ].filter(g => g.items.length)
}
