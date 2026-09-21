import {
  buildCycles, getCurrentCycle, getTxInCycle,
  getPctAtDate, getIncludedCycles, calcPotBalance,
  catBudget, calcCycleStats, calcSavingsRate, simulateMortgage,
  getPendingFixedExpenses, toLocalISODate,
} from './finance'

// Every test here encodes a bug that actually shipped and was
// reported, so these are regression guards first and documentation
// second. The recurring theme is retroactive rewriting: a value
// changed today must never alter a cycle that already closed.

// ── helpers ───────────────────────────────────────────────────
let seq = 0
const salaryTx = (date, amount) => ({
  id: `s${++seq}`, type: 'income', is_salary: true, date, amount,
  created_at: `${date}T09:00:00.000Z`,
})
const expense = (date, amount, category_id, extra = {}) => ({
  id: `e${++seq}`, type: 'expense', is_salary: false, date, amount, category_id,
  description: 'gasto', created_at: `${date}T09:00:00.000Z`, ...extra,
})
const potTx = (type, date, amount, category_id) => ({
  id: `p${++seq}`, type, date, amount, category_id,
  description: type, created_at: `${date}T09:00:00.000Z`,
})
const pot = (over = {}) => ({
  id: 'cat-pot', type: 'pot', user_pct: 10, opening_balance: 0,
  opening_balance_date: null, opening_balance_set_at: null, ...over,
})
const pctRow = (effective_from, user_pct, category_id = 'cat-pot') =>
  ({ category_id, user_pct, effective_from })

// Cycle boundaries are LOCAL midnights (startOfDay), so they must be
// read back in local time too -- toISOString() would shift them a day
// in any timezone east of UTC and make these assertions lie.
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

beforeEach(() => { seq = 0 })

// ── CYCLES ────────────────────────────────────────────────────
describe('buildCycles', () => {
  it('opens a cycle per salary and closes it the day before the next', () => {
    const cycles = buildCycles([
      salaryTx('2026-02-01', 2000),
      salaryTx('2026-01-01', 1000),
      expense('2026-01-15', 50, 'x'),
    ])
    expect(cycles).toHaveLength(2)
    expect(cycles[0].salary).toBe(1000)
    expect(ymd(cycles[0].start)).toBe('2026-01-01')
    expect(ymd(cycles[0].end)).toBe('2026-01-31')
    expect(cycles[1].salary).toBe(2000)
  })

  it('leaves the newest cycle open, ending now', () => {
    const cycles = buildCycles([salaryTx('2026-01-01', 1000)])
    expect(cycles[0].end.getTime()).toBeLessThanOrEqual(Date.now())
    expect(cycles[0].end.getTime()).toBeGreaterThan(new Date('2026-01-01').getTime())
  })

  it('ignores non-salary income', () => {
    expect(buildCycles([
      { id: 'x', type: 'income', is_salary: false, date: '2026-01-05', amount: 500 },
    ])).toHaveLength(0)
  })

  it('getCurrentCycle returns the newest, or null with no salary yet', () => {
    expect(getCurrentCycle([])).toBeNull()
    const cycles = buildCycles([salaryTx('2026-01-01', 1000), salaryTx('2026-02-01', 1000)])
    expect(getCurrentCycle(cycles)).toBe(cycles[1])
  })

  it('getTxInCycle includes both boundary days', () => {
    const [cycle] = buildCycles([salaryTx('2026-01-01', 1000), salaryTx('2026-02-01', 1000)])
    const txs = [
      expense('2025-12-31', 1, 'x'),
      expense('2026-01-01', 2, 'x'),
      expense('2026-01-31', 3, 'x'),
      expense('2026-02-01', 4, 'x'),
    ]
    expect(getTxInCycle(txs, cycle).map(t => t.amount)).toEqual([2, 3])
  })
})

// ── % HISTORY ─────────────────────────────────────────────────
describe('getPctAtDate', () => {
  const history = [
    pctRow('2026-01-01T00:00:00.000Z', 10),
    pctRow('2026-03-15T00:00:00.000Z', 5),
  ]

  it('returns the value in force on that date', () => {
    expect(getPctAtDate(history, 'cat-pot', new Date('2026-02-01'), 99)).toBe(10)
    expect(getPctAtDate(history, 'cat-pot', new Date('2026-04-01'), 99)).toBe(5)
  })

  it('falls back for dates before any recorded change', () => {
    expect(getPctAtDate(history, 'cat-pot', new Date('2025-06-01'), 99)).toBe(99)
  })

  it('ignores other categories', () => {
    expect(getPctAtDate(history, 'otra', new Date('2026-04-01'), 99)).toBe(99)
  })
})

// ── POT BALANCE ───────────────────────────────────────────────
describe('calcPotBalance', () => {
  const cycles = buildCycles([
    salaryTx('2026-01-01', 1000),
    salaryTx('2026-02-01', 1000),
    salaryTx('2026-03-01', 1000),
  ])

  it('accumulates one allocation per started cycle', () => {
    expect(calcPotBalance({
      category: pot(), salary: 1000, cycles, transactions: [], pctHistory: [],
    })).toBeCloseTo(300, 6)
  })

  it('subtracts expenses and withdrawals, adds deposits', () => {
    const transactions = [
      expense('2026-01-10', 50, 'cat-pot'),
      potTx('pot-withdrawal', '2026-02-10', 30, 'cat-pot'),
      potTx('pot-deposit', '2026-03-10', 20, 'cat-pot'),
      expense('2026-01-10', 999, 'otra-cat'),
    ]
    expect(calcPotBalance({
      category: pot(), salary: 1000, cycles, transactions, pctHistory: [],
    })).toBeCloseTo(300 - 50 - 30 + 20, 6)
  })

  it('keeps a pot negative after an overspend, then recovers it next cycle', () => {
    const oneCycle = buildCycles([salaryTx('2026-01-01', 1000)])
    const transactions = [expense('2026-01-10', 250, 'cat-pot')]
    expect(calcPotBalance({
      category: pot(), salary: 1000, cycles: oneCycle, transactions, pctHistory: [],
    })).toBeCloseTo(-150, 6)
    // The next salary adds another allocation on top of the debt.
    expect(calcPotBalance({
      category: pot(), salary: 1000, cycles, transactions, pctHistory: [],
    })).toBeCloseTo(50, 6)
  })

  it('credits a reimbursement linked to an expense in this pot', () => {
    const exp = expense('2026-01-10', 60, 'cat-pot')
    const transactions = [
      exp,
      { id: 'r1', type: 'transfer', date: '2026-01-12', amount: 25, category_id: null,
        linked_expense_id: exp.id, created_at: '2026-01-12T09:00:00.000Z' },
    ]
    expect(calcPotBalance({
      category: pot(), salary: 1000, cycles, transactions, pctHistory: [],
    })).toBeCloseTo(300 - 60 + 25, 6)
  })

  it('returns 0 for non-pot categories', () => {
    expect(calcPotBalance({
      category: pot({ type: 'normal' }), salary: 1000, cycles, transactions: [], pctHistory: [],
    })).toBe(0)
  })

  // ── the reported bugs ───────────────────────────────────────
  it('locks a closed cycle to the % in force when it closed', () => {
    // 10% through Jan and Feb, dropped to 5% mid-March. Jan and Feb
    // are closed and must keep their 100 each; only the open cycle
    // follows the new value.
    const pctHistory = [
      pctRow('2026-01-01T00:00:00.000Z', 10),
      pctRow('2026-03-15T00:00:00.000Z', 5),
    ]
    expect(calcPotBalance({
      category: pot({ user_pct: 5 }), salary: 1000, cycles, transactions: [], pctHistory,
    })).toBeCloseTo(100 + 100 + 50, 6)
  })

  it('uses each cycle\'s own salary, so a raise cannot rewrite the past', () => {
    const raised = buildCycles([
      salaryTx('2026-01-01', 1000),
      salaryTx('2026-02-01', 1000),
      salaryTx('2026-03-01', 2000), // raise
    ])
    // 100 + 100 + 200, NOT 3 x 200.
    expect(calcPotBalance({
      category: pot(), salary: 2000, cycles: raised, transactions: [], pctHistory: [],
    })).toBeCloseTo(400, 6)
  })

  it('counts only cycles from the reconciliation date onward', () => {
    const category = pot({
      opening_balance: 500,
      opening_balance_date: '2026-02-15',
      opening_balance_set_at: '2026-02-15T12:00:00.000Z',
    })
    // Jan and Feb cycles start before the reconciliation; only March
    // adds on top of the stated 500.
    expect(calcPotBalance({
      category, salary: 1000, cycles, transactions: [], pctHistory: [],
    })).toBeCloseTo(600, 6)
  })

  it('ignores transactions that already existed when the pot was reconciled', () => {
    const category = pot({
      opening_balance: 500,
      opening_balance_date: '2026-02-15',
      opening_balance_set_at: '2026-02-15T12:00:00.000Z',
    })
    const old = expense('2026-01-10', 80, 'cat-pot') // created well before
    expect(calcPotBalance({
      category, salary: 1000, cycles, transactions: [old], pctHistory: [],
    })).toBeCloseTo(600, 6)
  })

  it('still counts a backdated expense added AFTER reconciliation', () => {
    const category = pot({
      opening_balance: 500,
      opening_balance_date: '2026-02-15',
      opening_balance_set_at: '2026-02-15T12:00:00.000Z',
    })
    // Dated in January (before the reconciliation) but only recorded
    // in March -- new information the stated 500 could not include.
    const forgotten = expense('2026-01-10', 80, 'cat-pot', {
      created_at: '2026-03-02T10:00:00.000Z',
    })
    expect(calcPotBalance({
      category, salary: 1000, cycles, transactions: [forgotten], pctHistory: [],
    })).toBeCloseTo(600 - 80, 6)
  })

  it('getIncludedCycles excludes cycles that have not started yet', () => {
    expect(getIncludedCycles(pot(), cycles, new Date('2026-02-10'))).toHaveLength(2)
  })
})

// ── BUDGET ────────────────────────────────────────────────────
describe('catBudget', () => {
  const category = { id: 'cat-pot', user_pct: 5 }

  it('uses the live % when no history is supplied', () => {
    expect(catBudget(category, 2000)).toBeCloseTo(100, 6)
  })

  it('judges a past month against the % in force back then', () => {
    const history = [
      pctRow('2026-01-01T00:00:00.000Z', 10),
      pctRow('2026-03-01T00:00:00.000Z', 5),
    ]
    expect(catBudget(category, 2000, history, new Date('2026-02-01'))).toBeCloseTo(200, 6)
    expect(catBudget(category, 2000, history, new Date('2026-04-01'))).toBeCloseTo(100, 6)
  })
})

// ── CYCLE STATS ───────────────────────────────────────────────
describe('calcCycleStats', () => {
  const categories = [
    { id: 'c1', type: 'normal', user_pct: 10 },
    { id: 'cs', type: 'saving', user_pct: 20 },
  ]
  const [cycle] = buildCycles([salaryTx('2026-01-01', 1000), salaryTx('2026-02-01', 1000)])

  it('nets a linked reimbursement off its category and off expenses', () => {
    const exp = expense('2026-01-05', 100, 'c1')
    const stats = calcCycleStats({
      transactions: [
        exp,
        { id: 'r', type: 'transfer', date: '2026-01-06', amount: 40, linked_expense_id: exp.id },
      ],
      cycle, categories, salary: 1000, fixedExpenses: [],
    })
    expect(stats.expenses).toBeCloseTo(100, 6)
    expect(stats.netExpenses).toBeCloseTo(60, 6)
    expect(stats.spendByCat.c1).toBeCloseTo(60, 6)
  })

  it('reserves the saving share and subtracts fixed costs from available', () => {
    const stats = calcCycleStats({
      transactions: [], cycle, categories, salary: 1000,
      fixedExpenses: [{ amount: 300 }],
    })
    expect(stats.savingAmt).toBeCloseTo(200, 6)
    expect(stats.available).toBeCloseTo(500, 6)
  })

  it('never reports negative available', () => {
    const stats = calcCycleStats({
      transactions: [], cycle, categories, salary: 1000,
      fixedExpenses: [{ amount: 5000 }],
    })
    expect(stats.available).toBe(0)
  })
})

// ── MISC ──────────────────────────────────────────────────────
describe('calcSavingsRate', () => {
  it('is the share of income left over, floored at 0', () => {
    expect(calcSavingsRate(1000, 750)).toBeCloseTo(25, 6)
    expect(calcSavingsRate(1000, 1200)).toBe(0)
    expect(calcSavingsRate(0, 100)).toBe(0)
  })
})

describe('simulateMortgage', () => {
  it('amortises a loan and flags the effort level', () => {
    const r = simulateMortgage({
      price: 200000, downPayment: 60000, ratePercent: 3.5, years: 30, myNetIncome: 3000,
    })
    expect(r.loan).toBe(140000)
    expect(r.monthly).toBeGreaterThan(600)
    expect(r.monthly).toBeLessThan(700)
    expect(r.totalInterest).toBeGreaterThan(0)
    expect(r.riskLevel).toBe('excellent')
  })

  it('handles a 0% rate as a plain split of the loan', () => {
    const r = simulateMortgage({
      price: 120000, downPayment: 0, ratePercent: 0, years: 10, myNetIncome: 3000,
    })
    expect(r.monthly).toBeCloseTo(1000, 6)
  })
})

describe('getPendingFixedExpenses', () => {
  const [cycle] = buildCycles([salaryTx('2026-01-01', 1000), salaryTx('2026-02-01', 1000)])

  it('lists what has not been charged since the cycle opened', () => {
    const pending = getPendingFixedExpenses({
      fixedExpenses: [
        { id: 'a', last_charged_date: null },
        { id: 'b', last_charged_date: '2025-12-20' },
        { id: 'c', last_charged_date: '2026-01-05' },
      ],
      cycle,
    })
    expect(pending.map(f => f.id)).toEqual(['a', 'b'])
  })

  it('is empty with no cycle at all', () => {
    expect(getPendingFixedExpenses({ fixedExpenses: [{ id: 'a' }], cycle: null })).toEqual([])
  })
})

describe('toLocalISODate', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 00:30 local on the 1st: in any timezone east of UTC,
    // toISOString() would already say the 31st of the previous month.
    const justAfterMidnight = new Date(2026, 8, 1, 0, 30)
    expect(toLocalISODate(justAfterMidnight)).toBe('2026-09-01')
  })
  it('zero-pads month and day', () => {
    expect(toLocalISODate(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})
