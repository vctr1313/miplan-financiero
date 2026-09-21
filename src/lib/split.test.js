import { splitRemaining, validateSplit, splitGroups } from './split'

const line = (categoryId, amount) => ({ categoryId, amount })

describe('validateSplit', () => {
  it('accepts lines that add up exactly to the total', () => {
    expect(validateSplit('84.30', [line('food', '60.10'), line('home', '24.20')])).toBeNull()
  })
  it('is exact to the cent despite floating point', () => {
    // 0.1 + 0.2 !== 0.3 in floats; cents arithmetic must not care.
    expect(validateSplit('0.3', [line('a', '0.1'), line('b', '0.2')])).toBeNull()
  })
  it('reports what is left or over', () => {
    expect(validateSplit('50', [line('a', '20'), line('b', '20')])).toMatch(/Faltan 10,00/)
    expect(validateSplit('50', [line('a', '40'), line('b', '20')])).toMatch(/pasas en 10,00/)
  })
  it('needs two parts, each with a category and an amount', () => {
    expect(validateSplit('50', [line('a', '50')])).toMatch(/al menos dos/)
    expect(validateSplit('50', [line('a', '25'), line('', '25')])).toMatch(/categoría/)
    expect(validateSplit('50', [line('a', '50'), line('b', '0')])).toMatch(/mayor que 0/)
  })
  it('rejects the same category twice', () => {
    expect(validateSplit('50', [line('a', '25'), line('a', '25')])).toMatch(/misma categoría/)
  })
  it('requires a total first', () => {
    expect(validateSplit('', [line('a', '1'), line('b', '1')])).toMatch(/importe total/)
  })
})

it('splitRemaining works in cents', () => {
  expect(splitRemaining('10', [line('a', '3.33'), line('b', '3.33')])).toBeCloseTo(3.34, 6)
})

it('splitGroups counts parts and totals per group', () => {
  expect(splitGroups([
    { split_group: 'g1', amount: 60.1 }, { split_group: 'g1', amount: 24.2 },
    { split_group: null, amount: 5 },
  ])).toEqual({ g1: { count: 2, total: 84.3 } })
})
