import { parseISO, startOfDay } from 'date-fns'
import { calcCycleStats } from './finance'

// The "your cycle / your year" stories: a handful of full-screen
// slides summarising a period. Pure -- StoryViewer only draws them.

const DAY = 86400000
const inRange = (t, start, end) => {
  const d = parseISO(t.date)
  return d >= startOfDay(start) && d <= end
}

export function buildStory({ transactions, categories, start, end, title, salary = 0, prev = null }) {
  const cycle = { start, end, salary }
  const stats = calcCycleStats({ transactions, cycle, categories, salary, fixedExpenses: [] })
  const expenses = transactions.filter(t => t.type === 'expense' && inRange(t, start, end))
  const catById = Object.fromEntries(categories.map(c => [c.id, c]))

  const days = Math.max(1, Math.round((startOfDay(end) - startOfDay(start)) / DAY) + 1)
  const byDay = {}
  expenses.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + t.amount })
  const spendDays = Object.keys(byDay).length
  const busiest = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || null
  const biggest = [...expenses].sort((a, b) => b.amount - a.amount)[0] || null
  const top = Object.entries(stats.spendByCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0] || null
  const income = stats.income
  const saved = income - stats.netExpenses

  let prevDelta = null
  if (prev) {
    const p = calcCycleStats({ transactions, cycle: { start: prev.start, end: prev.end, salary }, categories, salary, fixedExpenses: [] })
    if (p.netExpenses > 0) prevDelta = (stats.netExpenses - p.netExpenses) / p.netExpenses
  }

  const slides = [{ kind: 'intro', title, sub: `${fmtDate(start)} – ${fmtDate(end)}` }]
  if (!expenses.length) {
    slides.push({ kind: 'empty' })
    return slides
  }
  slides.push({ kind: 'total', amount: stats.netExpenses, count: expenses.length, prevDelta })
  if (top) {
    const c = catById[top[0]]
    slides.push({ kind: 'top', emoji: c?.icon || '🏷️', name: c?.name || 'Sin categoría', amount: top[1], share: stats.netExpenses > 0 ? top[1] / stats.netExpenses : 0 })
  }
  if (biggest) slides.push({ kind: 'biggest', amount: biggest.amount, description: biggest.description, date: biggest.date, emoji: catById[biggest.category_id]?.icon || '💸' })
  if (busiest) slides.push({ kind: 'busiest', date: busiest[0], amount: busiest[1] })
  slides.push({ kind: 'calm', noSpendDays: days - spendDays, days })
  if (income > 0) slides.push({ kind: 'saved', amount: saved, rate: saved / income })
  slides.push({ kind: 'outro' })
  return slides
}

const fmtDate = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
