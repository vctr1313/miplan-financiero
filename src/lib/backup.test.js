import { buildBackup } from './backup'

it('exports raw rows, dropping joined display fields', () => {
  const data = buildBackup({
    profile: { id: 'u1', name: 'V', salary: 1800, household_id: 'h', households: { invite_code: 'secret' } },
    categories: [{ id: 'c1', name: 'Ocio' }],
    transactions: [{ id: 't1', amount: 5, categories: { name: 'Ocio' }, profiles: { name: 'V' } }],
    fixedExpenses: [{ id: 'f1', amount: 10, categories: { name: 'x' } }],
    houseGoal: { id: 'g', my_saved: 100 },
    savingGoals: [],
    pctHistory: [{ category_id: 'c1', user_pct: 5 }],
  })
  expect(data.transactions).toEqual([{ id: 't1', amount: 5 }])
  expect(data.fixedExpenses).toEqual([{ id: 'f1', amount: 10 }])
  // The invite code is a credential for linking accounts; keep it out.
  expect(JSON.stringify(data)).not.toContain('secret')
  expect(data.counts).toEqual({ categories: 1, transactions: 1, fixedExpenses: 1, savingGoals: 0 })
  expect(data.format).toBe(1)
})
