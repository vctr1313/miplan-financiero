import { buildCycles, getCurrentCycle, calcCycleStats, catBudget, calcPotBalance, fmt } from './finance'

// What the daily 20:00 push should say for one person, computed with
// the exact same rules the app uses on screen. Runs on the server
// (api/cron-alerts.js), so it only takes plain data -- the household's
// rows as the app would load them -- and returns candidate alerts.
//
// Each alert has a stable `key` scoped to the current cycle, so the
// sender can remember what it already pushed and never repeat itself:
// crossing 80% of Ocio is announced once per cycle, not every evening.
export function computeAlerts({ profile, categories, transactions, pctHistory = [], now = new Date() }) {
  const salary = profile?.salary || 0
  const cycles = buildCycles(transactions)
  const cycle = getCurrentCycle(cycles)
  if (!cycle) return []
  const cycleKey = cycle.txId || cycle.start.toISOString().slice(0, 10)
  const alerts = []

  // 1. Day-to-day categories at 80% / over budget this cycle. Pots are
  //    left out: going over a pot's monthly share just draws on what it
  //    has saved up; the pot alert below fires if that runs out.
  const stats = calcCycleStats({ transactions, cycle, categories, salary, fixedExpenses: [] })
  categories.filter(c => c.type === 'normal').forEach(c => {
    const budget = catBudget(c, salary)
    const spent = stats.spendByCat[c.id] || 0
    if (budget <= 0) return
    const ratio = spent / budget
    if (ratio >= 1) {
      alerts.push({
        key: `over:${c.id}:${cycleKey}`, url: '/budget',
        title: `${c.icon || ''} Te has pasado en ${c.name}`.trim(),
        body: `${fmt(spent)} de ${fmt(budget)} (+${fmt(spent - budget)}).`,
      })
    } else if (ratio >= 0.8) {
      alerts.push({
        key: `near:${c.id}:${cycleKey}`, url: '/budget',
        title: `${c.icon || ''} ${c.name} al ${Math.floor(ratio * 100)} %`.trim(),
        body: `Te quedan ${fmt(budget - spent)} de ${fmt(budget)} este ciclo.`,
      })
    }
  })

  // 2. A pot that has gone into debt. Once per cycle while it stays
  //    negative -- a reminder, not a daily nag.
  categories.filter(c => c.type === 'pot').forEach(c => {
    const balance = calcPotBalance({ category: c, salary, cycles, transactions, pctHistory, asOfDate: now })
    if (balance < -0.005) {
      alerts.push({
        key: `potneg:${c.id}:${cycleKey}`, url: '/savings',
        title: `${c.icon || ''} Bote ${c.name} en negativo`.trim(),
        body: `Saldo ${fmt(balance)}. La próxima asignación lo irá compensando.`,
      })
    }
  })

  // 3. The recap of the cycle that just closed, in the first days of
  //    the new one (same window as the in-app recap sheet).
  if (cycles.length >= 2 && now - cycle.start < 10 * 86400000) {
    const closed = cycles[cycles.length - 2]
    const s = calcCycleStats({ transactions, cycle: closed, categories, salary, fixedExpenses: [] })
    const budgeted = categories.filter(c => c.type !== 'saving')
      .reduce((sum, c) => sum + catBudget(c, closed.salary || salary, pctHistory, closed.end), 0)
    const overCount = categories.filter(c => c.type === 'normal').filter(c => {
      const b = catBudget(c, closed.salary || salary, pctHistory, closed.end)
      return b > 0 && (s.spendByCat[c.id] || 0) > b
    }).length
    const parts = [`Gastaste ${fmt(s.netExpenses)}` + (budgeted > 0 ? ` de ${fmt(budgeted)} previstos` : '')]
    parts.push(overCount ? `${overCount} categoría${overCount > 1 ? 's' : ''} por encima` : 'todo dentro del presupuesto')
    alerts.push({
      key: `recap:${closed.txId || closed.start.toISOString().slice(0, 10)}`, url: '/history',
      title: 'Resumen del ciclo anterior',
      body: parts.join(' · ') + '.',
    })
  }

  return alerts
}

// Several alerts on the same evening go out as ONE notification, so a
// bad day doesn't buzz the phone five times.
export function bundleAlerts(alerts) {
  if (!alerts.length) return null
  if (alerts.length === 1) {
    const [a] = alerts
    return { title: a.title, body: a.body, url: a.url, tag: 'miplan-daily' }
  }
  return {
    title: `${alerts.length} avisos de tu presupuesto`,
    body: alerts.map(a => a.title).join('\n'),
    url: '/',
    tag: 'miplan-daily',
  }
}
