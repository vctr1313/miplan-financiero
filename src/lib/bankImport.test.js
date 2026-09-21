import {
  parseCsv, detectDelimiter, parseAmount, parseDate, detectColumns, extractMovements,
  buildCategoryModel, suggestCategory, findDuplicate, looksLikeSalary,
} from './bankImport'

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56], ['-12,50', -12.5], ['12.50', 12.5], ['1,234.56', 1234.56],
    ['12,50 €', 12.5], ['(12,50)', -12.5], ['12,50-', -12.5], ['+300,00', 300],
    ['1.234', 1234], ['0,99', 0.99], [45.2, 45.2],
  ])('%s -> %s', (raw, expected) => {
    expect(parseAmount(raw)).toBeCloseTo(expected, 6)
  })
  it('rejects text', () => {
    expect(parseAmount('Saldo')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})

describe('parseDate', () => {
  it.each([
    ['21/09/2026', '2026-09-21'], ['1-2-26', '2026-02-01'], ['2026-09-21', '2026-09-21'],
    ['21.09.2026', '2026-09-21'], ['21/09/2026 10:32', '2026-09-21'], [46286, '2026-09-21'],
  ])('%s -> %s', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected)
  })
  it('rejects impossible dates and text', () => {
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('Fecha')).toBeNull()
  })
})

describe('CSV', () => {
  it('prefers ; for Spanish exports with comma decimals', () => {
    const csv = 'Fecha;Concepto;Importe\n01/09/2026;MERCADONA;-45,20\n02/09/2026;NOMINA;1.883,80'
    expect(detectDelimiter(csv)).toBe(';')
    expect(parseCsv(csv)[1]).toEqual(['01/09/2026', 'MERCADONA', '-45,20'])
  })
  it('handles quoted fields with delimiters inside', () => {
    const rows = parseCsv('"a;b";"c ""q"""\n1;2')
    expect(rows[0]).toEqual(['a;b', 'c "q"'])
  })
})

describe('detectColumns + extractMovements', () => {
  it('skips the account preamble and maps a single amount column', () => {
    const rows = [
      ['Cuenta', 'ES12 3456'],
      ['Titular', 'Víctor'],
      [],
      ['F. Operación', 'F. Valor', 'Concepto', 'Importe', 'Saldo'],
      ['18/09/2026', '18/09/2026', 'COMPRA TARJ MERCADONA MADRID', '-96,30', '1.200,00'],
      ['28/08/2026', '28/08/2026', 'NOMINA ACME SL', '1.883,80', '1.296,30'],
      ['', '', 'Saldo final', '', '1.200,00'],
    ]
    const m = detectColumns(rows)
    expect(m).toMatchObject({ headerIdx: 3, date: 0, description: 2, amount: 3 })
    const movs = extractMovements(rows, m)
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ date: '2026-09-18', amount: 96.3, sign: -1 })
    expect(movs[1]).toMatchObject({ date: '2026-08-28', amount: 1883.8, sign: 1 })
  })

  it('supports separate debit / credit columns', () => {
    const rows = [
      ['Fecha', 'Descripción', 'Cargo', 'Abono'],
      ['01/09/2026', 'Netflix', '12,99', ''],
      ['02/09/2026', 'Bizum Ana', '', '20,00'],
    ]
    const m = detectColumns(rows)
    expect(m).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, amount: null })
    expect(extractMovements(rows, m).map(r => r.sign * r.amount)).toEqual([-12.99, 20])
  })

  it('sniffs columns when there is no header at all', () => {
    const rows = [
      ['01/09/2026', 'Cafetería Sol', '-3,40'],
      ['02/09/2026', 'Gasolinera Repsol', '-50,00'],
    ]
    const m = detectColumns(rows)
    expect(m).toMatchObject({ headerIdx: -1, date: 0, description: 1, amount: 2 })
    expect(extractMovements(rows, m)).toHaveLength(2)
  })
})

describe('suggestions', () => {
  const history = [
    { type: 'expense', description: 'COMPRA TARJ MERCADONA VALENCIA', category_id: 'food' },
    { type: 'expense', description: 'Mercadona', category_id: 'food' },
    { type: 'expense', description: 'Mercadona droguería', category_id: 'home' },
    { type: 'expense', description: 'REPSOL ESTACION', category_id: 'car' },
  ]
  const model = buildCategoryModel(history)

  it('learns the usual category for a merchant, ignoring bank noise', () => {
    expect(suggestCategory('COMPRA TARJ. 4521 MERCADONA MADRID ES', model)).toBe('food')
    expect(suggestCategory('Pago Repsol 234', model)).toBe('car')
  })
  it('returns nothing for an unknown merchant', () => {
    expect(suggestCategory('ZARA ONLINE', model)).toBeNull()
  })
  it('spots a salary', () => {
    expect(looksLikeSalary('NOMINA ACME SL')).toBe(true)
    expect(looksLikeSalary('Transferencia Ana')).toBe(false)
  })
})

describe('findDuplicate', () => {
  const existing = [{ id: 't1', date: '2026-09-18', amount: 96.3, description: 'Supermercado Mercadona' }]
  it('matches same day, same amount, shared merchant word', () => {
    expect(findDuplicate({ date: '2026-09-18', amount: 96.3, description: 'COMPRA TARJ MERCADONA' }, existing)?.id).toBe('t1')
  })
  it('does not match a different day or amount', () => {
    expect(findDuplicate({ date: '2026-09-19', amount: 96.3, description: 'MERCADONA' }, existing)).toBeNull()
    expect(findDuplicate({ date: '2026-09-18', amount: 12, description: 'MERCADONA' }, existing)).toBeNull()
  })
})
