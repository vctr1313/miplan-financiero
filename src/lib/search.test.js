import { searchAll, normalize } from './search'

const data = {
  pages: [{ id: '/budget', label: 'Presupuesto', keywords: 'categorias porcentajes' }, { id: '/house', label: 'Mi Casa' }],
  actions: [{ id: 'expense', label: 'Añadir gasto' }],
  categories: [{ id: 'c1', name: 'Café y ocio', icon: '☕', type: 'normal' }, { id: 'c2', name: 'Viajes', type: 'pot' }],
  transactions: [
    { id: 't1', description: 'Supermercado', amount: 60.1, date: '2026-09-18', categories: { name: 'Comida' } },
    { id: 't2', description: 'Supermercado', amount: 88, date: '2026-08-11', categories: { name: 'Comida' } },
    { id: 't3', description: 'Netflix', amount: 12.99, date: '2026-09-14', categories: { name: 'Suscripciones' } },
  ],
}
const ids = (groups, title) => (groups.find(g => g.title === title)?.items || []).map(i => i.id)

test('ignores case and accents', () => {
  expect(normalize('  MÁS Café ')).toBe('mas cafe')
  expect(ids(searchAll('cafe', data), 'Categorías')).toEqual(['c1'])
  expect(ids(searchAll('anadir', data), 'Acciones')).toEqual(['expense'])
})

test('every word must match, in any order, including the month', () => {
  expect(ids(searchAll('super septiembre', data), 'Movimientos')).toEqual(['t1'])
  expect(ids(searchAll('agosto super', data), 'Movimientos')).toEqual(['t2'])
})

test('amounts are found with a comma or a dot', () => {
  expect(ids(searchAll('12,99', data), 'Movimientos')).toEqual(['t3'])
  expect(ids(searchAll('12.99', data), 'Movimientos')).toEqual(['t3'])
})

test('screens are found by their keywords too', () => {
  expect(ids(searchAll('porcentajes', data), 'Ir a')).toEqual(['/budget'])
})

test('newest movements first; empty query shows actions and screens', () => {
  expect(ids(searchAll('super', data), 'Movimientos')).toEqual(['t1', 't2'])
  expect(searchAll('', data).map(g => g.title)).toEqual(['Acciones', 'Ir a'])
})
