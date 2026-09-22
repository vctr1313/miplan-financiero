import { paceStreak, earnedNow, mergeEarned } from './achievements'
import { buildCycles } from './finance'

const salary = (date, amount = 2000) => ({ id: `s-${date}`, type: 'income', is_salary: true, date, amount, created_at: `${date}T09:00:00Z` })
const exp = (date, amount, category_id) => ({ id: `e-${date}-${amount}-${category_id}`, type: 'expense', date, amount, category_id, created_at: `${date}T09:00:00Z` })

test('streak counts the days in a row at or under an even pace', () => {
  const cycle = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) }
  // budget 300 -> 10 €/day of pace
  const txs = [exp('2026-09-01', 5, 'x'), exp('2026-09-03', 30, 'x'), exp('2026-09-05', 5, 'x')]
  // cum: 5,5,35,35,40,40,40 vs pace 10,20,30,40,50,60,70 -> day 3 over
  const s = paceStreak({ transactions: txs, cycle, budget: 300, now: new Date(2026, 8, 7, 12) })
  expect(s).toEqual({ current: 4, best: 4 })
})

test('achievements come from the data', () => {
  const categories = [
    { id: 'ocio', type: 'normal', user_pct: 10 },     // 200 €/cycle
    { id: 'viajes', type: 'pot', user_pct: 5, opening_balance: 0 }, // 100 €/cycle
  ]
  const transactions = [
    salary('2026-06-01'), salary('2026-07-01'), salary('2026-08-01'), salary('2026-09-01'),
    exp('2026-06-10', 150, 'ocio'), exp('2026-07-10', 150, 'ocio'), exp('2026-08-10', 150, 'ocio'),
  ]
  const got = earnedNow({
    transactions, categories, cycles: buildCycles(transactions), salary: 2000,
    shared: { settlements: [] }, now: new Date(2026, 8, 3, 12),
  })
  expect(got.has('first-salary')).toBe(true)
  expect(got.has('perfect-cycle')).toBe(true)
  expect(got.has('saver-20')).toBe(true)
  expect(got.has('three-in-row')).toBe(true)
  expect(got.has('pot-full')).toBe(true) // 4 cycles x 100, never spent
  expect(got.has('settled')).toBe(false)
  expect(got.has('hundred')).toBe(false)
})

test('overspending a category rules out a perfect cycle', () => {
  const categories = [{ id: 'ocio', type: 'normal', user_pct: 10 }]
  const transactions = [salary('2026-08-01'), salary('2026-09-01'), exp('2026-08-10', 250, 'ocio')]
  const got = earnedNow({ transactions, categories, cycles: buildCycles(transactions), salary: 2000, shared: null })
  expect(got.has('perfect-cycle')).toBe(false)
})

test('earned achievements are kept; only new ones are reported', () => {
  const { merged, fresh } = mergeEarned({ 'first-salary': '2026-01-01T00:00:00.000Z' }, new Set(['first-salary', 'hundred']), new Date('2026-09-01T00:00:00Z'))
  expect(fresh).toEqual(['hundred'])
  expect(merged['first-salary']).toBe('2026-01-01T00:00:00.000Z')
  expect(Object.keys(merged)).toHaveLength(2)
})
