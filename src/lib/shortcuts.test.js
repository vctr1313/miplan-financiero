import { parseAmount, merchantKey, findRule, matchCategory, remainingFor, daysToNextSalary, expenseMessage, summaryMessage, recentExpenseOptions } from './shortcuts'

describe('parseAmount', () => {
  it.each([
    ['23,40 €', 23.4], ['€23.40', 23.4], ['1.234,56 €', 1234.56], ['1,234.56 EUR', 1234.56],
    ['-12,5', 12.5], ['4', 4], ['1.234', 1234], ['0.500', 0.5], [18, 18], [-7.333, 7.33],
  ])('%p → %p', (input, out) => expect(parseAmount(input)).toBe(out))

  it.each([[''], ['abc'], [null], [0], ['0,00 €'], [NaN]])('%p → null', (input) => expect(parseAmount(input)).toBeNull())
})

describe('merchants', () => {
  it('keeps the stable part of a shop name', () => {
    expect(merchantKey('MERCADONA, S.A.')).toBe('mercadona')
    expect(merchantKey('Mercadona Av. Paz 23')).toBe('mercadona av paz')
    expect(merchantKey('Café Ñandú 0042')).toBe('cafe nandu')
    expect(merchantKey('Bar Pepe S.L.')).toBe('bar pepe')
    expect(merchantKey('1234')).toBe('')
  })

  it('finds the longest matching rule', () => {
    const rules = [
      { merchant_key: 'mercadona', category_id: 'super' },
      { merchant_key: 'repsol', category_id: 'transporte' },
      { merchant_key: 'repsol tienda', category_id: 'super' },
    ]
    expect(findRule(rules, 'MERCADONA AV PAZ').category_id).toBe('super')
    expect(findRule(rules, 'Repsol 3321').category_id).toBe('transporte')
    expect(findRule(rules, 'Repsol Tienda Centro').category_id).toBe('super')
    expect(findRule(rules, 'Mercadonas')).toBeNull()
    expect(findRule(rules, '')).toBeNull()
  })

  it('recognises another branch of the same chain, but not of a generic word', () => {
    const rules = [
      { merchant_key: 'mercadona av paz', category_id: 'super' },
      { merchant_key: 'bar manolo', category_id: 'ocio' },
      { merchant_key: 'zara gran via', category_id: 'ropa' },
      { merchant_key: 'zara home', category_id: 'casa' },
    ]
    expect(findRule(rules, 'Mercadona').category_id).toBe('super')
    expect(findRule(rules, 'MERCADONA C MAYOR').category_id).toBe('super')
    expect(findRule(rules, 'Bar Pepe')).toBeNull()
    expect(findRule(rules, 'Zara Online')).toBeNull() // two Zara rules disagree
  })
})

const categories = [
  { id: 'ocio', name: 'Ocio', type: 'normal', user_pct: 10, sort_order: 1 },
  { id: 'cf', name: 'Comida fuera', type: 'normal', user_pct: 5, sort_order: 2 },
  { id: 'viajes', name: 'Viajes', type: 'pot', user_pct: 10, sort_order: 3 },
  { id: 'ahorro', name: 'Ahorro', type: 'saving', user_pct: 20, sort_order: 4 },
]

describe('matchCategory', () => {
  it('accepts ids and names however they arrive', () => {
    expect(matchCategory(categories, 'ocio').id).toBe('ocio')
    expect(matchCategory(categories, '🍹 OCIO').id).toBe('ocio')
    expect(matchCategory(categories, 'comida fuera').id).toBe('cf')
    expect(matchCategory(categories, 'Comida').id).toBe('cf')
    expect(matchCategory(categories, 'viajes').id).toBe('viajes')
  })
  it('never files an expense under a saving category', () => {
    expect(matchCategory(categories, 'Ahorro')).toBeNull()
    expect(matchCategory(categories, 'nada')).toBeNull()
    expect(matchCategory(categories, '')).toBeNull()
  })
})

const now = new Date(2026, 10, 10, 12)
// The open cycle ends "now" (buildCycles reads the clock), so pin it.
beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(now) })
afterAll(() => jest.useRealTimers())
const tx = (id, type, amount, date, extra = {}) => ({ id, type, amount, date, created_at: `${date}T10:00:00Z`, description: id, ...extra })
const transactions = [
  tx('s1', 'income', 2000, '2026-09-28', { is_salary: true }),
  tx('s2', 'income', 2000, '2026-10-28', { is_salary: true }),
  tx('e1', 'expense', 50, '2026-10-30', { category_id: 'ocio' }),
  tx('e2', 'expense', 30, '2026-11-05', { category_id: 'ocio' }),
  tx('b1', 'transfer', 10, '2026-11-06', { linked_expense_id: 'e2' }),
  tx('e3', 'expense', 500, '2026-11-01', { category_id: 'viajes' }),
  tx('old', 'expense', 999, '2026-10-01', { category_id: 'ocio' }),
]
const profile = { salary: 2000 }
const ctx = { profile, categories, transactions, now }

describe('what is left', () => {
  it('day-to-day categories: budget minus this cycle, Bizum discounted', () => {
    expect(remainingFor({ ...ctx, category: categories[0] })).toBe(200 - 50 - 30 + 10)
  })
  it('pots: running balance across cycles', () => {
    expect(remainingFor({ ...ctx, category: categories[2] })).toBe(200 + 200 - 500)
  })
  it('saving categories: nothing to spend', () => {
    expect(remainingFor({ ...ctx, category: categories[3] })).toBeNull()
  })
  it('estimates the next nómina from past cycles', () => {
    // Closed cycle 28/9–27/10 = 30 days → next ≈ 27/11, 17 days from 10/11 noon.
    expect(daysToNextSalary(transactions, now)).toBe(17)
    expect(daysToNextSalary([], now)).toBeNull()
  })
})

describe('messages', () => {
  it('after filing an expense', () => {
    expect(expenseMessage({ amount: 23.4, merchant: 'Mercadona', category: categories[0], left: 142 }))
      .toBe('23,40 € · Mercadona → Ocio\nTe quedan 142 € en Ocio este ciclo.')
    expect(expenseMessage({ amount: 5, merchant: '', category: categories[2], left: -20 }))
      .toBe('5 € → Viajes\nViajes: bote en negativo (-20 €).')
    expect(expenseMessage({ amount: 5, merchant: 'Bar', category: null }))
      .toContain('Pendientes de revisar')
  })
  it('summary for one category and for everything', () => {
    expect(summaryMessage({ ...ctx, category: categories[0] })).toBe('Te quedan 130 € en Ocio. Unos 17 días para la nómina.')
    const all = summaryMessage(ctx)
    expect(all).toContain('Te quedan 230 € para el día a día.')
    expect(all).toContain('Viajes (bote): bote en negativo (-100 €)')
    expect(all).not.toContain('Ahorro')
  })
  it('summary before any nómina', () => {
    expect(summaryMessage({ ...ctx, transactions: [] })).toContain('Aún no hay ninguna nómina')
  })
})

it('labels recent expenses uniquely, newest first', () => {
  const opts = recentExpenseOptions([
    tx('a', 'expense', 18, '2026-11-02', { description: 'Bar Manolo' }),
    tx('b', 'expense', 18, '2026-11-02', { description: 'Bar Manolo' }),
    tx('c', 'expense', 4.5, '2026-11-05', { description: 'Café' }),
    tx('d', 'income', 10, '2026-11-06'),
  ])
  expect(opts.map(o => o.label)).toEqual(['05/11 · Café · 4,50 €', '02/11 · Bar Manolo · 18 €', '02/11 · Bar Manolo · 18 € (2)'])
})
