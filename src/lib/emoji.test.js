import { searchEmoji, EMOJI_GROUPS } from './emoji'

const all = (groups) => groups.flatMap(g => g.items.map(([e]) => e))

test('empty search shows every group', () => {
  expect(searchEmoji('  ')).toBe(EMOJI_GROUPS)
})

test('finds by Spanish words, ignoring accents, every word must match', () => {
  expect(all(searchEmoji('gasolina'))).toEqual(['⛽'])
  expect(all(searchEmoji('CAFÉ'))).toContain('☕')
  expect(all(searchEmoji('comida rapida'))).toEqual(['🍕', '🍔'])
})

test('a group title matches all its emoji', () => {
  expect(all(searchEmoji('transporte'))).toContain('🚲')
})

test('no emoji is listed twice', () => {
  const list = all(EMOJI_GROUPS)
  expect(new Set(list).size).toBe(list.length)
})
