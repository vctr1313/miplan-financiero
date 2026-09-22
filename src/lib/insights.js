import { parseISO, startOfDay } from 'date-fns'
import { toLocalISODate, catBudget, fixedTotal } from './finance'

// Data behind the visual summaries (sparklines, projection, salary
// flow, treemap, calendar). Pure functions over the same rows the app
// already has, so every chart agrees with the numbers elsewhere.

const DAY = 86400000
// An open cycle ends "now"; for anything that needs its full length
// assume ~30 days, same as the pace dial (CyclePace).
export const ASSUMED_CYCLE_DAYS = 30

const dayIndex = (cycle, dateStr) =>
  Math.floor((startOfDay(parseISO(dateStr)) - startOfDay(cycle.start)) / DAY)

// Net spend per day of the cycle: expenses minus reimbursements that
// arrived that day. Optionally only for one category (reimbursements
// count against the category of the expense they repay).
export function dailySpend(transactions, cycle, { categoryId = null, days = ASSUMED_CYCLE_DAYS } = {}) {
  const out = new Array(days).fill(0)
  if (!cycle) return out
  const expenseCat = {}
  transactions.forEach(t => { if (t.type === 'expense') expenseCat[t.id] = t.category_id })
  transactions.forEach(t => {
    const i = dayIndex(cycle, t.date)
    if (i < 0 || i >= days) return
    // A closed cycle may be shorter than `days`: nothing past its end.
    if (cycle.end && parseISO(t.date) > cycle.end) return
    if (t.type === 'expense' && (!categoryId || t.category_id === categoryId)) out[i] += t.amount
    else if (t.type === 'transfer' && (!categoryId || (t.linked_expense_id && expenseCat[t.linked_expense_id] === categoryId))) out[i] -= t.amount
  })
  return out
}

export const cumulative = (series) => {
  let sum = 0
  return series.map(v => (sum += v))
}

// Where the cycle is heading: actual cumulative spend up to today, the
// even-pace line to the budget, and today's pace carried to the end
// of the cycle.
export function cycleProjection({ transactions, cycle, budget, now = new Date() }) {
  const days = ASSUMED_CYCLE_DAYS
  if (!cycle) return null
  const today = Math.min(days - 1, Math.max(0, Math.floor((startOfDay(now) - startOfDay(cycle.start)) / DAY)))
  const actual = cumulative(dailySpend(transactions, cycle, { days })).slice(0, today + 1)
  const spent = actual[actual.length - 1] || 0
  // Same rule as the pace dial (CyclePace), so the two never disagree:
  // the share of the cycle elapsed, to the hour, extrapolated.
  const elapsed = Math.min(1, Math.max(0, (now - cycle.start) / (days * DAY)))
  const projectedEnd = elapsed > 0.02 ? spent / elapsed : spent
  const perDay = projectedEnd / days
  const ideal = Array.from({ length: days }, (_, i) => budget * (i + 1) / days)
  const projected = Array.from({ length: days }, (_, i) => (
    i < today ? null : today >= days - 1 ? spent : spent + (projectedEnd - spent) * (i - today) / (days - 1 - today)
  ))
  return { days, today, actual, ideal, projected, spent, projectedEnd, budget, diff: budget - projectedEnd, perDay }
}

// How a salary splits up, for the flow diagram: fixed costs, savings,
// pots, day-to-day categories, and whatever is left unassigned.
export function salaryFlow({ salary, categories, fixedExpenses }) {
  if (!salary) return null
  const fx = fixedTotal(fixedExpenses)
  const group = (type) => categories.filter(c => c.type === type)
    .map(c => ({ id: c.id, label: c.name, icon: c.icon, color: c.color, value: catBudget(c, salary) }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)
  const groups = [
    { id: 'fixed', label: 'Gastos fijos', color: '#32ade6', value: fx, children: [] },
    { id: 'saving', label: 'Ahorro', color: '#34c759', children: group('saving') },
    { id: 'pot', label: 'Botes', color: '#ff9500', children: group('pot') },
    { id: 'normal', label: 'Día a día', color: '#ff2d55', children: group('normal') },
  ].map(g => ({ ...g, value: g.children.length ? g.children.reduce((s, c) => s + c.value, 0) : g.value || 0 }))
  const assigned = groups.reduce((s, g) => s + g.value, 0)
  const free = salary - assigned
  if (free > 0.5) groups.push({ id: 'free', label: 'Sin asignar', color: '#8e8e93', value: free, children: [] })
  return { salary, groups: groups.filter(g => g.value > 0), over: free < -0.5 ? -free : 0 }
}

// Squarified treemap (Bruls et al.): lays `items` ({ value }) into a
// w x h box with rectangles as close to square as possible, largest
// first. Returns items with x, y, w, h.
export function squarify(items, width, height) {
  const data = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value)
  const total = data.reduce((s, i) => s + i.value, 0)
  if (!total || width <= 0 || height <= 0) return []
  const scale = (width * height) / total
  const nodes = data.map(i => ({ ...i, area: i.value * scale }))
  const out = []
  let x = 0, y = 0, w = width, h = height
  let row = []

  const worst = (r, side) => {
    const s = r.reduce((a, n) => a + n.area, 0)
    const max = Math.max(...r.map(n => n.area))
    const min = Math.min(...r.map(n => n.area))
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min))
  }
  const layRow = (r) => {
    const s = r.reduce((a, n) => a + n.area, 0)
    if (w >= h) {
      const rw = s / h
      let yy = y
      r.forEach(n => { const nh = n.area / rw; out.push({ ...n, x, y: yy, w: rw, h: nh }); yy += nh })
      x += rw; w -= rw
    } else {
      const rh = s / w
      let xx = x
      r.forEach(n => { const nw = n.area / rh; out.push({ ...n, x: xx, y, w: nw, h: rh }); xx += nw })
      y += rh; h -= rh
    }
  }

  nodes.forEach(n => {
    const side = Math.min(w, h)
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n)
    else { layRow(row); row = [n] }
  })
  if (row.length) layRow(row)
  return out.map(({ area, ...r }) => r)
}

// A month as calendar weeks (Monday first). Each day carries what was
// spent/earned, and fixed expenses expected that day: a fixed charge
// last paid on the 5th is expected on the 5th of later months until
// it's recorded again.
export function monthCalendar({ year, month, transactions, fixedExpenses = [], today = new Date() }) {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const byDay = {}
  transactions.forEach(t => {
    const d = parseISO(t.date)
    if (d.getFullYear() !== year || d.getMonth() !== month) return
    const k = d.getDate()
    byDay[k] = byDay[k] || { spent: 0, income: 0, count: 0 }
    byDay[k].count++
    if (t.type === 'expense' || t.type === 'pot-withdrawal') byDay[k].spent += t.amount
    else if (t.type === 'transfer') byDay[k].spent -= t.amount
    else if (t.type === 'income') byDay[k].income += t.amount
  })
  const todayISO = toLocalISODate(today)
  const expected = {}
  fixedExpenses.forEach(f => {
    if (!f.last_charged_date) return
    const last = parseISO(f.last_charged_date)
    const lastKey = last.getFullYear() * 12 + last.getMonth()
    if (year * 12 + month <= lastKey) return // already charged this month (or it's in the past)
    const day = Math.min(last.getDate(), daysInMonth)
    const iso = toLocalISODate(new Date(year, month, day))
    if (iso < todayISO) return
    ;(expected[day] = expected[day] || []).push(f)
  })

  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = toLocalISODate(new Date(year, month, d))
    cells.push({ day: d, iso, isToday: iso === todayISO, isFuture: iso > todayISO, ...(byDay[d] || { spent: 0, income: 0, count: 0 }), fixed: expected[d] || [] })
  }
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const maxSpent = Math.max(0, ...cells.filter(Boolean).map(c => c.spent))
  return { weeks, maxSpent }
}
