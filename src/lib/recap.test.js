import { pendingRecap, markRecapSeen } from './recap'

const DAY = 86400000
const cycle = (daysAgo, i) => ({ index: i, txId: `s${i}`, start: new Date(Date.now() - daysAgo * DAY) })

beforeEach(() => localStorage.clear())

it('offers the just-closed cycle while the new one is fresh', () => {
  const cycles = [cycle(40, 0), cycle(33, 1), cycle(3, 2)]
  const r = pendingRecap(cycles)
  expect(r.cycle).toBe(cycles[1])
  expect(r.prevCycle).toBe(cycles[0])
})

it('shows it only once per closed cycle', () => {
  const cycles = [cycle(33, 0), cycle(3, 1)]
  markRecapSeen(cycles[0])
  expect(pendingRecap(cycles)).toBeNull()
})

it('stays quiet once the new cycle is more than 10 days old', () => {
  expect(pendingRecap([cycle(45, 0), cycle(15, 1)])).toBeNull()
})

it('needs a closed cycle to summarise', () => {
  expect(pendingRecap([cycle(3, 0)])).toBeNull()
})
