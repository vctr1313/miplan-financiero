import { resolveLayout, moveSection, toggleSection, layoutRows, HOME_SECTIONS } from './homeLayout'

const ids = (l) => l.map(e => e.id)

test('no saved layout means the default order, all visible', () => {
  const l = resolveLayout(null)
  expect(ids(l)).toEqual(HOME_SECTIONS.map(s => s.id))
  expect(l.every(e => !e.hidden)).toBe(true)
})

test('a saved order is kept; unknown and duplicate ids are dropped', () => {
  const l = resolveLayout([{ id: 'house' }, { id: 'nope' }, { id: 'house' }, { id: 'hero', hidden: true }])
  expect(ids(l)[0]).toBe('house')
  expect(ids(l).indexOf('house')).toBeLessThan(ids(l).indexOf('hero'))
  expect(l.find(e => e.id === 'hero').hidden).toBe(true)
  expect(ids(l)).toHaveLength(HOME_SECTIONS.length)
})

test('a section added to the app later shows up next to its default neighbour', () => {
  // Saved before "shared" existed.
  const saved = HOME_SECTIONS.filter(s => s.id !== 'shared').map(s => ({ id: s.id }))
  const l = resolveLayout(saved)
  expect(ids(l).indexOf('shared')).toBe(ids(l).indexOf('recurring') + 1)
})

test('moving and hiding', () => {
  let l = resolveLayout(null)
  l = moveSection(l, 'hero', -1)
  expect(ids(l).indexOf('hero')).toBe(ids(resolveLayout(null)).indexOf('hero') - 1)
  expect(moveSection(l, ids(l)[0], -1)).toBe(l) // already first
  l = toggleSection(l, 'kpis')
  expect(l.find(e => e.id === 'kpis').hidden).toBe(true)
})

test('adjacent half cards pair up; hidden ones leave their partner alone', () => {
  const rows = layoutRows(resolveLayout(null))
  expect(rows.find(r => r.half).ids).toEqual(['budget', 'recent'])
  const alone = layoutRows(toggleSection(resolveLayout(null), 'recent'))
  expect(alone.find(r => r.ids.includes('budget')).ids).toEqual(['budget'])
})
