import { parseISO, isAfter, isBefore, startOfDay } from 'date-fns'

// ── FORMAT ────────────────────────────────────────────────────
export const fmt = (n) => {
  const num = Math.round((n || 0) * 100) / 100
  return num.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'
}

export const fmtShort = (n) =>
  Math.round(n || 0).toLocaleString('es-ES') + ' €'

export const fmtPct = (n) =>
  (Math.round((n || 0) * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + '%'

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export const monthLabel = (date) =>
  cap(new Date(date).toLocaleString('es-ES', { month: 'long', year: 'numeric' }))

// ── SALARY CYCLES ─────────────────────────────────────────────
// A cycle starts when a salary income is recorded.
// All pots and budgets are calculated per-cycle, not per-calendar-month.
export const buildCycles = (salaryTransactions) => {
  const sorted = [...salaryTransactions]
    .filter(t => t.type === 'income' && t.is_salary)
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  return sorted.map((tx, i) => {
    const start = startOfDay(parseISO(tx.date))
    const end = sorted[i + 1]
      ? new Date(parseISO(sorted[i + 1].date).getTime() - 86400000)
      : new Date()
    return {
      start,
      end,
      salary: tx.amount,
      txId: tx.id,
      userId: tx.user_id,
      userName: tx.profiles?.name,
      index: i
    }
  })
}

export const getCurrentCycle = (cycles) =>
  cycles.length ? cycles[cycles.length - 1] : null

export const getTxInCycle = (transactions, cycle) => {
  if (!cycle) return []
  return transactions.filter(t => {
    const d = parseISO(t.date)
    return !isBefore(d, cycle.start) && !isAfter(d, cycle.end)
  })
}

export const getFirstSalaryDate = (transactions) => {
  const salaryTxs = transactions
    .filter(t => t.type === 'income' && t.is_salary)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  return salaryTxs.length ? parseISO(salaryTxs[0].date) : null
}

// ── POT BALANCE ───────────────────────────────────────────────
// Pots start accumulating from the first salary tx.
// Each completed cycle adds one month's allocation.
export const calcPotBalance = ({ category, salary, cycles, transactions, asOfDate = new Date() }) => {
  if (category.type !== 'pot') return 0

  const firstSalary = cycles.length ? cycles[0].start : null
  if (!firstSalary) return 0

  // Count cycles that have started on or before asOfDate
  const completedCycles = cycles.filter(cy => !isAfter(cy.start, asOfDate)).length
  const monthlyAlloc = salary * (category.user_pct / 100)
  let balance = completedCycles * monthlyAlloc

  transactions.forEach(t => {
    if (t.category_id !== category.id) return
    // Regular spending and manual withdrawals reduce the pot.
    if (t.type === 'expense' || t.type === 'pot-withdrawal') {
      balance -= t.amount
    }
    // pot-deposit is the extra-payment-distribution case: money added
    // to a pot OUTSIDE the normal cycle-based automatic accumulation
    // above (e.g. splitting a paga extra into Viajes/Regalos/etc).
    if (t.type === 'pot-deposit') {
      balance += t.amount
    }
  })

  // Negative balances are kept (not floored at 0) so an overspend
  // shows as debt on the pot. Because this is recomputed from the
  // full running total each time, the next cycle's allocation or
  // paga-extra pot-deposit automatically pays the debt down first.
  return balance
}

// ── BUDGET ────────────────────────────────────────────────────
export const catBudget = (category, salary) =>
  salary * (category.user_pct / 100)

export const fixedTotal = (fixedExpenses) =>
  fixedExpenses.reduce((s, f) => s + f.amount, 0)

export const fixedPct = (fixedExpenses, salary) =>
  salary > 0 ? fixedTotal(fixedExpenses) / salary * 100 : 0

// ── CYCLE STATS ───────────────────────────────────────────────
export const calcCycleStats = ({ transactions, cycle, categories, salary, fixedExpenses }) => {
  const txs = cycle ? getTxInCycle(transactions, cycle) : transactions

  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const reimbursements = txs.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0)
  const balance = income + reimbursements - expenses

  const savingPct = categories
    .filter(c => c.type === 'saving')
    .reduce((s, c) => s + c.user_pct, 0)
  const savingAmt = salary * savingPct / 100

  const fxTotal = fixedTotal(fixedExpenses)
  const cycleIncome = cycle ? cycle.salary : salary
  const available = Math.max(0, cycleIncome - fxTotal - savingAmt)

  const spendByCat = {}
  categories.forEach(c => { spendByCat[c.id] = 0 })
  txs.filter(t => t.type === 'expense').forEach(t => {
    if (t.category_id && spendByCat[t.category_id] !== undefined)
      spendByCat[t.category_id] += t.amount
  })

  // Subtract linked reimbursements from the original expense's category.
  // Look up the expense in ALL transactions (not just the current cycle)
  // since the original expense may be from a previous cycle.
  const expenseCatById = {}
  transactions.forEach(t => {
    if (t.type === 'expense' && t.category_id) expenseCatById[t.id] = t.category_id
  })
  txs.filter(t => t.type === 'transfer' && t.linked_expense_id).forEach(t => {
    const catId = expenseCatById[t.linked_expense_id]
    if (catId && spendByCat[catId] !== undefined)
      spendByCat[catId] = Math.max(0, spendByCat[catId] - t.amount)
  })

  return { income, expenses, reimbursements, balance, available, savingAmt, fxTotal, spendByCat, txs }
}

// ── HOUSE GOAL ────────────────────────────────────────────────
// getPartnerContribution centralizes the "real linked-partner data vs
// manual entry" branch that House.jsx, Dashboard.jsx and
// buildAIContext all need: when a partner is linked, use their actual
// salary/saving-rate/saved amount from get_partner_summary(); when
// not, fall back to the manual p_salary/p_pct/p_saved fields the
// "pair mode" feature has always used (e.g. for a partner who doesn't
// use the app). Keeping this in one place avoids the three call sites
// drifting out of sync the way they did before (see the pair-mode
// consistency fix referenced elsewhere in this file).
export const getPartnerContribution = ({ houseGoal, partnerSummary }) => {
  if (houseGoal?.pair_mode !== 'pair') return { savingPerCycle: 0, saved: 0, isLive: false }
  if (partnerSummary) {
    return {
      savingPerCycle: (partnerSummary.partner_salary || 0) * (partnerSummary.saving_pct || 0) / 100,
      saved: partnerSummary.house_saved || 0,
      isLive: true,
    }
  }
  return {
    savingPerCycle: (houseGoal.p_salary || 0) * (houseGoal.p_pct || 0) / 100,
    saved: houseGoal.p_saved || 0,
    isLive: false,
  }
}

export const calcHouseProgress = ({ goal, mySavingPerCycle, partnerSavingPerCycle = 0, partnerSaved = null }) => {
  if (!goal) return {}

  const entryTarget = (goal.target || 0) * (goal.dp_pct || 30) / 100
  const totalSaved = (goal.my_saved || 0) + (goal.pair_mode === 'pair' ? (partnerSaved != null ? partnerSaved : (goal.p_saved || 0)) : 0)
  const totalMonthly = mySavingPerCycle + (goal.pair_mode === 'pair' ? partnerSavingPerCycle : 0)
  const remaining = entryTarget - totalSaved
  const pct = entryTarget > 0 ? Math.min(100, totalSaved / entryTarget * 100) : 0
  const monthsLeft = totalMonthly > 0 && remaining > 0 ? Math.ceil(remaining / totalMonthly) : null
  const yearsLeft = monthsLeft ? Math.floor(monthsLeft / 12) : null
  const mos = monthsLeft ? monthsLeft % 12 : null

  return { entryTarget, totalSaved, totalMonthly, remaining, pct, monthsLeft, yearsLeft, mos }
}

// ── SAVINGS RATE ──────────────────────────────────────────────
export const calcSavingsRate = (income, expenses) =>
  income > 0 ? Math.max(0, (income - expenses) / income * 100) : 0

// ── MORTGAGE SIMULATOR ────────────────────────────────────────
export const simulateMortgage = ({ price, downPayment, ratePercent, years, myNetIncome, partnerNetIncome = 0, isPair = false }) => {
  const loan = Math.max(0, price - downPayment)
  const r = ratePercent / 100 / 12
  const n = years * 12
  const monthly = loan > 0 && r > 0
    ? loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
    : loan > 0 ? loan / n : 0

  const totalPaid = monthly * n + downPayment
  const totalInterest = totalPaid - price
  const combinedIncome = myNetIncome + (isPair ? partnerNetIncome : 0)
  const effortPct = combinedIncome > 0 ? monthly / combinedIncome * 100 : null
  const effortSoloPct = isPair && myNetIncome > 0 ? monthly / myNetIncome * 100 : null

  let riskLevel = 'unknown'
  if (effortPct !== null) {
    if (effortPct <= 30) riskLevel = 'excellent'
    else if (effortPct <= 35) riskLevel = 'acceptable'
    else if (effortPct <= 45) riskLevel = 'high'
    else riskLevel = 'dangerous'
  }

  return { loan, monthly, totalPaid, totalInterest, effortPct, effortSoloPct, riskLevel }
}

// ── RECURRING FIXED EXPENSES ──────────────────────────────────
// A fixed expense is "pending" for the current cycle if it hasn't
// been charged yet since the cycle started.
export const getPendingFixedExpenses = ({ fixedExpenses, cycle }) => {
  if (!cycle) return []
  return fixedExpenses.filter(f => {
    if (!f.last_charged_date) return true
    const lastCharged = parseISO(f.last_charged_date)
    return isBefore(lastCharged, cycle.start)
  })
}

// ── AI CONTEXT BUILDER ────────────────────────────────────────
export const buildAIContext = ({ profile, categories, transactions, fixedExpenses, houseGoal, cycles, partnerSummary }) => {
  const cycle = getCurrentCycle(cycles)
  const stats = calcCycleStats({ transactions, cycle, categories, salary: profile.salary || 0, fixedExpenses })
  const mySavingPerCycle = (profile.salary || 0) * categories.filter(c => c.type === 'saving').reduce((s, c) => s + c.user_pct, 0) / 100
  // Same pair-mode fix as Dashboard.jsx: without including the
  // partner's contribution, the AI advisor would tell the user their
  // time-to-goal is much longer than it actually is whenever pair
  // mode is active, contradicting what House.jsx correctly shows.
  const { savingPerCycle: partnerSavingPerCycle, saved: partnerSaved } = getPartnerContribution({ houseGoal, partnerSummary })
  const houseCalc = calcHouseProgress({ goal: houseGoal, mySavingPerCycle, partnerSavingPerCycle, partnerSaved })

  const topCats = categories
    .map(c => ({ name: c.name, spent: stats.spendByCat[c.id] || 0, budget: catBudget(c, profile.salary || 0) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5)

  return `DATOS FINANCIEROS COMPLETOS:
- Sueldo neto: ${fmt(profile.salary || 0)}/mes
- Nombre: ${profile.name || 'usuario'}
- Ciclo actual: ${cycle ? `del ${cycle.start.toLocaleDateString('es-ES')} al ${cycle.end.toLocaleDateString('es-ES')}` : 'sin nómina registrada'}
- Gastos fijos: ${fmt(fixedTotal(fixedExpenses))} (${fixedPct(fixedExpenses, profile.salary || 0).toFixed(1)}% del sueldo)

CICLO ACTUAL:
- Ingresos: ${fmt(stats.income)}
- Gastos: ${fmt(stats.expenses)}
- Balance: ${fmt(stats.balance)}
- Disponible tras fijos y ahorro: ${fmt(stats.available)}
- Tasa de ahorro: ${calcSavingsRate(stats.income, stats.expenses).toFixed(1)}%

TOP GASTOS POR CATEGORÍA:
${topCats.map(c => `- ${c.name}: ${fmt(c.spent)} (presup. ${fmt(c.budget)})`).join('\n')}

META CASA:
- Objetivo: ${fmt(houseGoal?.target || 0)} (entrada ${houseGoal?.dp_pct || 30}% = ${fmt(houseCalc.entryTarget || 0)})
- Ahorrado: ${fmt(houseCalc.totalSaved || 0)}
- Ahorro mensual destinado: ${fmt(mySavingPerCycle)}
- Tiempo estimado: ${houseCalc.yearsLeft != null ? `${houseCalc.yearsLeft}a ${houseCalc.mos}m` : 'sin datos'}

HISTORIAL: ${transactions.length} movimientos registrados, ${cycles.length} ciclos completados`
}
