import { computeAlerts, bundleAlerts } from './alerts'

// The evening push is judged with the same numbers the app shows, so
// these pin down when each kind of alert fires -- and, just as
// important, when it stays quiet.
const salary = (date, amount = 2000, id = `s-${date}`) =>
  ({ id, type: 'income', is_salary: true, date, amount, created_at: `${date}T09:00:00Z` })
const expense = (date, amount, category_id) =>
  ({ id: `e-${date}-${amount}-${category_id}`, type: 'expense', date, amount, category_id, created_at: `${date}T09:00:00Z` })

const ocio = { id: 'ocio', name: 'Ocio', icon: '🎉', type: 'normal', user_pct: 10 } // 200 €
const compras = { id: 'compras', name: 'Compras', icon: '🛍️', type: 'pot', user_pct: 5, opening_balance: 0 } // 100 €/ciclo
const ahorro = { id: 'ahorro', name: 'Ahorro', type: 'saving', user_pct: 20 }
const profile = { salary: 2000 }
const categories = [ocio, compras, ahorro]
const now = new Date(2026, 8, 20, 20, 0)

const run = (transactions) => computeAlerts({ profile, categories, transactions, now })

test('quiet when every category is comfortably inside its budget', () => {
  expect(run([salary('2026-09-01'), expense('2026-09-05', 100, 'ocio')])).toEqual([])
})

test('80 % of a day-to-day category is announced once per cycle', () => {
  const alerts = run([salary('2026-09-01'), expense('2026-09-05', 170, 'ocio')])
  expect(alerts).toHaveLength(1)
  expect(alerts[0].key).toBe('near:ocio:s-2026-09-01')
  expect(alerts[0].title).toContain('85 %')
})

test('going over replaces the 80 % warning with an overspend alert', () => {
  const [a] = run([salary('2026-09-01'), expense('2026-09-05', 230, 'ocio')])
  expect(a.key).toBe('over:ocio:s-2026-09-01')
  expect(a.body).toContain('+30')
})

test('a pot overspending its monthly share only alerts once the pot itself is negative', () => {
  // 100 € allocated this cycle: 150 € spent leaves the pot at -50.
  expect(run([salary('2026-09-01'), expense('2026-09-05', 150, 'compras')]).map(a => a.key))
    .toEqual(['potneg:compras:s-2026-09-01'])
  // Two cycles saved up (200 €): the same 150 € is fine.
  expect(run([salary('2026-08-01'), salary('2026-09-01'), expense('2026-09-05', 150, 'compras')])
    .filter(a => a.key.startsWith('potneg'))).toEqual([])
})

test('the previous cycle gets a recap in the first days of the new one, and not later', () => {
  const txs = [salary('2026-08-15'), expense('2026-08-20', 250, 'ocio'), salary('2026-09-15')]
  const recap = run(txs).find(a => a.key.startsWith('recap:'))
  expect(recap.key).toBe('recap:s-2026-08-15')
  expect(recap.body).toContain('1 categoría por encima')
  const later = computeAlerts({ profile, categories, transactions: txs, now: new Date(2026, 9, 1) })
  expect(later.find(a => a.key.startsWith('recap:'))).toBeUndefined()
})

test('no salary recorded yet means nothing to judge', () => {
  expect(run([expense('2026-09-05', 999, 'ocio')])).toEqual([])
})

test('several alerts go out as a single notification', () => {
  expect(bundleAlerts([])).toBeNull()
  const one = bundleAlerts([{ title: 'A', body: 'a', url: '/budget' }])
  expect(one).toMatchObject({ title: 'A', body: 'a', url: '/budget' })
  const two = bundleAlerts([{ title: 'A', body: 'a', url: '/x' }, { title: 'B', body: 'b', url: '/y' }])
  expect(two).toMatchObject({ title: '2 avisos de tu presupuesto', body: 'A\nB', url: '/' })
})
