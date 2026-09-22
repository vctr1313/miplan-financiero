import { confirmDialog, alertDialog, answerDialog, subscribeDialogs, toast, actToast, flushToasts, _resetDialogs } from './dialog'

// The app's own confirm/alert/undo. What matters: answers resolve the
// right promise, dialogs queue instead of stacking, and a pending
// undo either runs its action or, if left alone, commits.
let state
beforeEach(() => { jest.useFakeTimers(); _resetDialogs(); subscribeDialogs(s => { state = s }) })
afterEach(() => jest.useRealTimers())

test('confirm resolves with the button the user picked', async () => {
  const yes = confirmDialog({ title: 'A' })
  answerDialog(state.dialogs[0].id, true)
  await expect(yes).resolves.toBe(true)
  const no = confirmDialog({ title: 'B' })
  answerDialog(state.dialogs[0].id, false)
  await expect(no).resolves.toBe(false)
})

test('dialogs queue: the second waits for the first', async () => {
  const first = alertDialog({ title: 'uno' })
  confirmDialog({ title: 'dos' })
  expect(state.dialogs.map(d => d.title)).toEqual(['uno', 'dos'])
  answerDialog(state.dialogs[0].id)
  await first
  expect(state.dialogs.map(d => d.title)).toEqual(['dos'])
})

test('undo runs the action and never commits', () => {
  const onAction = jest.fn(), onExpire = jest.fn()
  const id = toast({ text: 'x', actionText: 'Deshacer', onAction, onExpire, duration: 5000 })
  actToast(id)
  jest.advanceTimersByTime(10000)
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onExpire).not.toHaveBeenCalled()
  expect(state.toasts).toEqual([])
})

test('left alone, the toast commits once when its time is up', () => {
  const onExpire = jest.fn()
  toast({ text: 'x', onExpire, duration: 5000 })
  jest.advanceTimersByTime(4999)
  expect(onExpire).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1)
  expect(onExpire).toHaveBeenCalledTimes(1)
})

test('leaving the app commits every pending undo immediately', () => {
  const a = jest.fn(), b = jest.fn()
  toast({ text: 'a', onExpire: a, duration: 5000 })
  toast({ text: 'b', onExpire: b, duration: 5000 })
  flushToasts()
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(10000)
  expect(a).toHaveBeenCalledTimes(1)
})
