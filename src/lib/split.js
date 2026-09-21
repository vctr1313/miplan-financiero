// Splitting one purchase across categories. Each line becomes its own
// expense row sharing a split_group id (see supabase_patch_split_
// expenses.sql), so the only rules that matter live here: every line
// needs a category and a positive amount, and the lines must add up
// to the ticket total, to the cent.

const cents = (v) => Math.round((parseFloat(v) || 0) * 100)

export const splitRemaining = (total, lines) =>
  (cents(total) - lines.reduce((s, l) => s + cents(l.amount), 0)) / 100

export function validateSplit(total, lines) {
  if (!(parseFloat(total) > 0)) return 'Indica primero el importe total'
  if (lines.length < 2) return 'Un reparto necesita al menos dos categorías'
  if (lines.some(l => !l.categoryId)) return 'Elige la categoría de cada parte'
  if (lines.some(l => !(parseFloat(l.amount) > 0))) return 'Cada parte necesita un importe mayor que 0'
  const ids = lines.map(l => l.categoryId)
  if (new Set(ids).size !== ids.length) return 'Hay dos partes con la misma categoría: júntalas en una'
  const rest = splitRemaining(total, lines)
  if (rest > 0) return `Faltan ${rest.toFixed(2).replace('.', ',')} € por repartir`
  if (rest < 0) return `Te pasas en ${(-rest).toFixed(2).replace('.', ',')} € del total`
  return null
}

// { [split_group]: { count, total } } for labelling the parts in lists.
export function splitGroups(transactions) {
  const out = {}
  transactions.forEach(t => {
    if (!t.split_group) return
    const g = out[t.split_group] || (out[t.split_group] = { count: 0, total: 0 })
    g.count += 1
    g.total = (cents(g.total) + cents(t.amount)) / 100
  })
  return out
}
