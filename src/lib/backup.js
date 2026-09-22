import { toLocalISODate } from './finance'

// Full export of everything the app knows about this household, as one
// self-describing JSON file. Built from the data already in memory
// rather than fresh queries, so it is exactly what the app is showing.
//
// Joined/display-only fields (categories(...), profiles(...) embedded
// in each transaction) are dropped: they duplicate the categories list
// and would go stale in the file. What's kept is the raw rows.
const stripJoins = ({ categories, profiles, ...row }) => row

export function buildBackup({ profile, categories, transactions, fixedExpenses, houseGoal, savingGoals, pctHistory, shared }) {
  return {
    app: 'Mi Plan Financiero',
    format: 1,
    exportedAt: new Date().toISOString(),
    profile: profile && {
      id: profile.id,
      name: profile.name,
      salary: profile.salary,
      birth_year: profile.birth_year,
      household_id: profile.household_id,
    },
    categories: categories.map(c => ({ ...c })),
    categoryPctHistory: pctHistory.map(h => ({ ...h })),
    transactions: transactions.map(stripJoins),
    fixedExpenses: fixedExpenses.map(({ categories: _c, ...f }) => f),
    houseGoal: houseGoal ? { ...houseGoal } : null,
    savingGoals: savingGoals.map(g => ({ ...g })),
    sharedExpenses: (shared?.expenses || []).map(e => ({ ...e })),
    sharedSettlements: (shared?.settlements || []).map(e => ({ ...e })),
    counts: {
      categories: categories.length,
      transactions: transactions.length,
      fixedExpenses: fixedExpenses.length,
      savingGoals: savingGoals.length,
    },
  }
}

export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `miplan-copia-${toLocalISODate(new Date())}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
