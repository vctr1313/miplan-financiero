// Which cards the home screen shows, and in what order. Saved per
// device (it's a view preference, like the theme).
//
// `half` cards sit two-by-two on wide screens when they end up next to
// each other; alone, they take the full width.
export const HOME_SECTIONS = [
  { id: 'cycle', label: 'Nómina del ciclo', icon: 'fa-rotate' },
  { id: 'recurring', label: 'Gastos fijos pendientes', icon: 'fa-repeat' },
  { id: 'shared', label: 'Saldo con tu pareja', icon: 'fa-user-group' },
  { id: 'hero', label: 'Ritmo del ciclo y anillos', icon: 'fa-gauge-high' },
  { id: 'kpis', label: 'Ingresos, gastos y balance', icon: 'fa-coins' },
  { id: 'budget', label: 'Presupuesto del ciclo', icon: 'fa-sliders', half: true },
  { id: 'recent', label: 'Últimos movimientos', icon: 'fa-list', half: true },
  { id: 'house', label: 'Meta de la casa', icon: 'fa-house' },
  { id: 'alerts', label: 'Avisos', icon: 'fa-triangle-exclamation' },
]
const KEY = 'fp_home_layout'
const known = new Map(HOME_SECTIONS.map(s => [s.id, s]))

// Saved order first (dropping ids that no longer exist), then any
// section added to the app since, visible, in its default place.
export function resolveLayout(saved) {
  const seen = new Set()
  const out = []
  ;(Array.isArray(saved) ? saved : []).forEach(e => {
    if (!e || !known.has(e.id) || seen.has(e.id)) return
    seen.add(e.id)
    out.push({ id: e.id, hidden: !!e.hidden })
  })
  HOME_SECTIONS.forEach((s, i) => {
    if (seen.has(s.id)) return
    // Slot a new section in after its default predecessor.
    const prev = HOME_SECTIONS[i - 1]?.id
    const at = prev ? out.findIndex(e => e.id === prev) + 1 : 0
    out.splice(at > 0 ? at : out.length, 0, { id: s.id, hidden: false })
  })
  return out
}

export const moveSection = (layout, id, delta) => {
  const i = layout.findIndex(e => e.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= layout.length) return layout
  const next = [...layout]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export const toggleSection = (layout, id) =>
  layout.map(e => (e.id === id ? { ...e, hidden: !e.hidden } : e))

// Visible ids grouped into rows: consecutive half cards pair up.
export function layoutRows(layout) {
  const rows = []
  layout.filter(e => !e.hidden).forEach(e => {
    const half = known.get(e.id)?.half
    const last = rows[rows.length - 1]
    if (half && last?.half && last.ids.length === 1) last.ids.push(e.id)
    else rows.push({ half: !!half, ids: [e.id] })
  })
  return rows
}

export function loadLayout() {
  try { return resolveLayout(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return resolveLayout(null) }
}
export function saveLayout(layout) {
  try { localStorage.setItem(KEY, JSON.stringify(layout)) } catch { /* private mode */ }
}
export function resetLayout() {
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
  return resolveLayout(null)
}
