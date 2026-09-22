import { buildStory } from './story'

const categories = [{ id: 'ocio', name: 'Ocio', icon: '🎉', type: 'normal', user_pct: 10 }, { id: 'comida', name: 'Comida', icon: '🛒', type: 'normal', user_pct: 20 }]
const t = (id, type, date, amount, category_id = null, extra = {}) => ({ id, type, date, amount, category_id, description: id, ...extra })

const start = new Date(2026, 7, 1)
const end = new Date(2026, 7, 10, 23, 59)

test('a period with spending tells its story in order', () => {
  const txs = [
    t('nomina', 'income', '2026-08-01', 2000, null, { is_salary: true }),
    t('cena', 'expense', '2026-08-03', 80, 'ocio'),
    t('super', 'expense', '2026-08-03', 40, 'comida'),
    t('cine', 'expense', '2026-08-07', 20, 'ocio'),
    t('fuera', 'expense', '2026-08-20', 999, 'ocio'), // outside the period
    t('julio', 'expense', '2026-07-20', 70, 'ocio'),
  ]
  const s = buildStory({ transactions: txs, categories, start, end, title: 'Tu ciclo', salary: 2000,
    prev: { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59) } })
  expect(s.map(x => x.kind)).toEqual(['intro', 'total', 'top', 'biggest', 'busiest', 'calm', 'saved', 'outro'])
  const by = Object.fromEntries(s.map(x => [x.kind, x]))
  expect(by.total).toMatchObject({ amount: 140, count: 3 })
  expect(by.total.prevDelta).toBeCloseTo(1) // 140 vs 70 -> +100 %
  expect(by.top).toMatchObject({ name: 'Ocio', amount: 100 })
  expect(by.biggest).toMatchObject({ description: 'cena', amount: 80 })
  expect(by.busiest).toMatchObject({ date: '2026-08-03', amount: 120 })
  expect(by.calm).toEqual({ kind: 'calm', noSpendDays: 8, days: 10 })
  expect(by.saved.amount).toBe(1860)
})

test('a period without spending says so', () => {
  const s = buildStory({ transactions: [], categories, start, end, title: 'Tu ciclo' })
  expect(s.map(x => x.kind)).toEqual(['intro', 'empty'])
})
