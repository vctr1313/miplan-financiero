import { dailySpend, cumulative, cycleProjection, salaryFlow, squarify, monthCalendar, statusLine } from './insights'

const cycle = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 20) }
const tx = (id, type, date, amount, category_id, extra = {}) => ({ id, type, date, amount, category_id, ...extra })

test('daily spend nets reimbursements against the day they arrive and the category they repay', () => {
  const txs = [
    tx('a', 'expense', '2026-09-01', 30, 'ocio'),
    tx('b', 'expense', '2026-09-03', 20, 'comida'),
    tx('c', 'transfer', '2026-09-03', 10, null, { linked_expense_id: 'a' }),
    tx('d', 'expense', '2026-08-31', 99, 'ocio'), // previous cycle
  ]
  const all = dailySpend(txs, cycle, { days: 5 })
  expect(all).toEqual([30, 0, 10, 0, 0])
  expect(dailySpend(txs, cycle, { categoryId: 'ocio', days: 5 })).toEqual([30, 0, -10, 0, 0])
  expect(cumulative(all)).toEqual([30, 30, 40, 40, 40])
})

test('projection carries the current pace to the end of the cycle', () => {
  const txs = [tx('a', 'expense', '2026-09-01', 50, 'x'), tx('b', 'expense', '2026-09-10', 50, 'x')]
  const p = cycleProjection({ transactions: txs, cycle, budget: 600, now: new Date(2026, 8, 10, 12) })
  expect(p.today).toBe(9)
  expect(p.spent).toBe(100)
  // 9.5 of 30 days elapsed (noon of day 10), same rule as the pace dial
  expect(p.projectedEnd).toBeCloseTo(100 / (9.5 / 30))
  expect(p.diff).toBeCloseTo(600 - 100 / (9.5 / 30))
  expect(p.projected[8]).toBeNull()
  expect(p.projected[9]).toBe(100)
  expect(p.projected[29]).toBeCloseTo(p.projectedEnd)
})

test('salary flow groups the salary and shows what is left unassigned', () => {
  const f = salaryFlow({
    salary: 2000,
    categories: [
      { id: 'a', name: 'Ocio', type: 'normal', user_pct: 10 },
      { id: 'b', name: 'Viajes', type: 'pot', user_pct: 5 },
      { id: 'c', name: 'Casa', type: 'saving', user_pct: 20 },
    ],
    fixedExpenses: [{ amount: 500 }],
  })
  expect(f.groups.map(g => [g.id, g.value])).toEqual([['fixed', 500], ['saving', 400], ['pot', 100], ['normal', 200], ['free', 800]])
})

test('treemap fills the box exactly, largest first', () => {
  const rects = squarify([{ id: 'a', value: 6 }, { id: 'b', value: 6 }, { id: 'c', value: 4 }, { id: 'd', value: 3 }, { id: 'e', value: 2 }, { id: 'f', value: 2 }, { id: 'g', value: 1 }], 600, 400)
  expect(rects).toHaveLength(7)
  const area = rects.reduce((s, r) => s + r.w * r.h, 0)
  expect(area).toBeCloseTo(600 * 400)
  rects.forEach(r => {
    expect(r.x).toBeGreaterThanOrEqual(-1e-9)
    expect(r.y).toBeGreaterThanOrEqual(-1e-9)
    expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6)
    expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6)
  })
  expect(rects[0].id).toBe('a')
})

test('calendar: Monday-first weeks, daily totals, and upcoming fixed charges', () => {
  const cal = monthCalendar({
    year: 2026, month: 8, // September 2026 starts on a Tuesday
    transactions: [tx('a', 'expense', '2026-09-03', 12, 'x'), tx('b', 'income', '2026-09-03', 100, null)],
    fixedExpenses: [
      { id: 'rent', amount: 500, last_charged_date: '2026-08-25' }, // expected on the 25th
      { id: 'gym', amount: 30, last_charged_date: '2026-09-02' },   // already paid this month
      { id: 'old', amount: 9, last_charged_date: '2026-08-05' },    // the 5th is already past
    ],
    today: new Date(2026, 8, 10),
  })
  expect(cal.weeks[0][0]).toBeNull()
  expect(cal.weeks[0][1].day).toBe(1)
  const day = (d) => cal.weeks.flat().find(c => c && c.day === d)
  expect(day(3)).toMatchObject({ spent: 12, income: 100, count: 2 })
  expect(day(25).fixed.map(f => f.id)).toEqual(['rent'])
  expect(day(2).fixed).toEqual([])
  expect(day(5).fixed).toEqual([])
  expect(cal.weeks.every(w => w.length === 7)).toBe(true)
})

describe('status line', () => {
  const cycle = { start: new Date(2026, 8, 1) }
  const at = (d) => new Date(2026, 8, d, 12)
  test('no cycle or no budget asks for setup', () => {
    expect(statusLine({ cycle: null, spent: 0, budget: 100 }).tone).toBe('info')
    expect(statusLine({ cycle, spent: 0, budget: 0 }).tone).toBe('info')
  })
  test('on track: what is left, spread over the days left', () => {
    // day 10 at noon: 9.5 of 30 days gone, 300 of 900 spent -> on pace
    const s = statusLine({ cycle, spent: 250, budget: 900, now: at(10) })
    expect(s.tone).toBe('good')
    // day 10 of 30 -> 20 days left, like the dial; 650 left
    expect(s.text).toBe('Vas bien: puedes gastar 33 € al día durante 20 días.')
  })
  test('ahead of pace warns with the overshoot', () => {
    const s = statusLine({ cycle, spent: 600, budget: 900, now: at(10) })
    expect(s.tone).toBe('warn')
    expect(s.text).toContain('te pasarás')
  })
  test('already over budget', () => {
    expect(statusLine({ cycle, spent: 950, budget: 900, now: at(20) })).toMatchObject({ tone: 'bad' })
  })
})
