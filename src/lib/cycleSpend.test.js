import { buildCycles, calcCycleStats, calcPotBalance } from './finance'

// Every screen and the iPhone shortcuts read "gastado" from
// calcCycleStats, so these pin down which cycle a movement belongs to.
const tx = (id, type, amount, date, extra = {}) => ({ id, type, amount, date, created_at: `${date}T10:00:00Z`, ...extra })
const ocio = { id: 'ocio', name: 'Ocio', type: 'pot', user_pct: 10 }
const salaries = [
  tx('s1', 'income', 1500, '2026-09-30', { is_salary: true }),
  tx('s2', 'income', 1500, '2026-10-30', { is_salary: true }),
]

it('an expense on the last day of a cycle stays in that cycle, on the first day in the next', () => {
  const transactions = [...salaries, tx('a', 'expense', 20, '2026-10-29', { category_id: 'ocio' }), tx('b', 'expense', 7, '2026-10-30', { category_id: 'ocio' })]
  const [prev, cur] = buildCycles(transactions)
  expect(calcCycleStats({ transactions, cycle: prev, categories: [ocio], salary: 1500, fixedExpenses: [] }).spendByCat.ocio).toBe(20)
  expect(calcCycleStats({ transactions, cycle: cur, categories: [ocio], salary: 1500, fixedExpenses: [] }).spendByCat.ocio).toBe(7)
})

it('a pot shows this cycle\'s spend and its balance falls by the same amount', () => {
  const before = calcPotBalance({ category: ocio, salary: 1500, cycles: buildCycles(salaries), transactions: salaries })
  const transactions = [...salaries, tx('c', 'expense', 12.5, '2026-11-03', { category_id: 'ocio' })]
  const cur = buildCycles(transactions)[1]
  expect(calcCycleStats({ transactions, cycle: cur, categories: [ocio], salary: 1500, fixedExpenses: [] }).spendByCat.ocio).toBe(12.5)
  expect(before - calcPotBalance({ category: ocio, salary: 1500, cycles: buildCycles(transactions), transactions })).toBeCloseTo(12.5)
})
