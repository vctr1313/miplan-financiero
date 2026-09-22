import { calcCycleStats, catBudget, calcPotBalance } from './finance'
import { dailySpend, cumulative, ASSUMED_CYCLE_DAYS } from './insights'

// Streaks and achievements, computed from the data the app already
// has (nothing new is stored server-side). Once earned, an achievement
// is remembered on the device, so it doesn't vanish when, say, the
// cycle that earned it rolls out of view.

const DAY = 86400000
const spendable = (categories, salary, pctHistory, at) =>
  categories.filter(c => c.type !== 'saving').reduce((s, c) => s + catBudget(c, salary, pctHistory, at), 0)

// Days in a row, up to today, on which total spending stayed at or
// under an even pace towards this cycle's budget.
export function paceStreak({ transactions, cycle, budget, now = new Date() }) {
  if (!cycle || !(budget > 0)) return { current: 0, best: 0 }
  const today = Math.min(ASSUMED_CYCLE_DAYS - 1, Math.max(0, Math.floor((now - cycle.start) / DAY)))
  const cum = cumulative(dailySpend(transactions, cycle, { days: today + 1 }))
  const ok = cum.map((v, d) => v <= budget * (d + 1) / ASSUMED_CYCLE_DAYS + 0.005)
  let best = 0, run = 0
  ok.forEach(v => { run = v ? run + 1 : 0; best = Math.max(best, run) })
  let current = 0
  for (let d = ok.length - 1; d >= 0 && ok[d]; d--) current++
  return { current, best }
}

export const ACHIEVEMENTS = [
  { id: 'first-salary', icon: '💼', title: 'Primera nómina', text: 'Registraste tu primera nómina y empezó tu primer ciclo.' },
  { id: 'streak-7', icon: '🔥', title: 'Racha de 7 días', text: 'Una semana entera gastando al ritmo de tu presupuesto.' },
  { id: 'streak-28', icon: '🏆', title: 'Mes impecable', text: '28 días seguidos dentro del ritmo del presupuesto.' },
  { id: 'perfect-cycle', icon: '✨', title: 'Ciclo perfecto', text: 'Cerraste un ciclo sin pasarte en ninguna categoría del día a día.' },
  { id: 'saver-20', icon: '🐷', title: 'Ahorrador', text: 'Un ciclo en el que te quedó al menos el 20 % de la nómina.' },
  { id: 'three-in-row', icon: '📅', title: 'Constancia', text: 'Tres ciclos seguidos gastando menos de lo presupuestado.' },
  { id: 'pot-full', icon: '🪣', title: 'Bote lleno', text: 'Un bote con tres ciclos de asignación acumulados.' },
  { id: 'hundred', icon: '💯', title: '100 movimientos', text: 'Ya llevas 100 movimientos registrados.' },
  { id: 'settled', icon: '🤝', title: 'Cuentas claras', text: 'Saldaste cuentas con tu pareja por primera vez.' },
]

// Which achievements the data satisfies right now.
export function earnedNow({ transactions, categories, cycles, salary, pctHistory = [], shared, now = new Date() }) {
  const got = new Set()
  if (cycles.length) got.add('first-salary')
  if (transactions.length >= 100) got.add('hundred')
  if (shared?.settlements?.length) got.add('settled')

  const current = cycles[cycles.length - 1]
  if (current) {
    const { best } = paceStreak({ transactions, cycle: current, budget: spendable(categories, salary, pctHistory, now), now })
    if (best >= 7) got.add('streak-7')
    if (best >= 28) got.add('streak-28')
  }

  const closed = cycles.slice(0, -1)
  const underBudget = closed.map(cy => {
    const income = cy.salary || salary
    const s = calcCycleStats({ transactions, cycle: cy, categories, salary: income, fixedExpenses: [] })
    const normals = categories.filter(c => c.type === 'normal')
    const anyOver = normals.some(c => {
      const b = catBudget(c, income, pctHistory, cy.end)
      return b > 0 && (s.spendByCat[c.id] || 0) > b + 0.005
    })
    if (!anyOver && s.expenses > 0) got.add('perfect-cycle')
    if (income > 0 && (income - s.netExpenses) / income >= 0.2) got.add('saver-20')
    return s.netExpenses <= spendable(categories, income, pctHistory, cy.end) + 0.005
  })
  for (let i = 2; i < underBudget.length; i++) {
    if (underBudget[i] && underBudget[i - 1] && underBudget[i - 2]) got.add('three-in-row')
  }

  categories.filter(c => c.type === 'pot').forEach(c => {
    const perCycle = catBudget(c, salary)
    if (perCycle > 0 && calcPotBalance({ category: c, salary, cycles, transactions, pctHistory, asOfDate: now }) >= perCycle * 3) got.add('pot-full')
  })
  return got
}

const KEY = 'fp_achievements'
export function loadEarned() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
// Adds newly satisfied achievements to the stored ones; returns the
// merged map and which ids are new this time (for a celebration).
export function mergeEarned(stored, nowIds, when = new Date()) {
  const merged = { ...stored }
  const fresh = []
  nowIds.forEach(id => {
    if (!merged[id]) { merged[id] = when.toISOString(); fresh.push(id) }
  })
  return { merged, fresh }
}
export function saveEarned(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* private mode */ }
}
