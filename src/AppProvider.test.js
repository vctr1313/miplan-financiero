import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// The real data layer is replaced with counters, so these tests check
// WHICH datasets get refetched -- the whole point of selective refresh.
// State lives on `global` because jest.mock() is hoisted above every
// other statement in this file.
global.mockCalls = {}
global.mockDirty = new Set()

jest.mock('./lib/supabase', () => {
  const track = (name, value) => async () => {
    global.mockCalls[name] = (global.mockCalls[name] || 0) + 1
    return value
  }
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
    getProfile: track('profile', { id: 'u1', household_id: 'h1', partner_id: null }),
    getCategories: track('categories', []),
    getTransactions: track('transactions', []),
    getFixedExpenses: track('fixedExpenses', []),
    getHouseGoal: track('houseGoal', null),
    getSavingGoals: track('savingGoals', []),
    getCategoryPctHistory: track('pctHistory', []),
    getPartnerSummary: track('partnerSummary', null),
    subscribeToHousehold: () => () => {},
    markDirty: (...k) => k.forEach(x => global.mockDirty.add(x)),
    takeDirty: () => { const k = [...global.mockDirty]; global.mockDirty = new Set(); return k },
  }
})

// eslint-disable-next-line import/first
import { AppProvider, useApp } from './App'
// eslint-disable-next-line import/first
import { markDirty } from './lib/supabase'

global.IS_REACT_ACT_ENVIRONMENT = true
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

let api
function Probe() { api = useApp(); return null }

let container, root
beforeEach(async () => {
  global.mockCalls = {}
  global.mockDirty = new Set()
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => { root.render(<AppProvider><Probe /></AppProvider>) })
  await flush()
})
afterEach(() => act(() => root.unmount()))

const snapshot = () => ({ ...global.mockCalls })
const diff = (before) => Object.fromEntries(
  Object.entries(global.mockCalls).filter(([k, v]) => v !== (before[k] || 0)).map(([k, v]) => [k, v - (before[k] || 0)])
)

it('loads every dataset once on start', () => {
  expect(global.mockCalls).toEqual({
    profile: 1, categories: 1, transactions: 1, fixedExpenses: 1,
    houseGoal: 1, savingGoals: 1, pctHistory: 1,
  })
  expect(api.loading).toBe(false)
})

it('after a write, refresh() refetches only what that write touched', async () => {
  const before = snapshot()
  markDirty('transactions')
  await act(async () => { await api.refresh() })
  expect(diff(before)).toEqual({ transactions: 1 })
})

it('covers several slices touched by one action', async () => {
  const before = snapshot()
  markDirty('categories', 'pctHistory')
  await act(async () => { await api.refresh() })
  expect(diff(before)).toEqual({ categories: 1, pctHistory: 1 })
})

it('with nothing recorded (pull to refresh) reloads everything', async () => {
  const before = snapshot()
  await act(async () => { await api.refresh() })
  expect(Object.keys(diff(before)).sort()).toEqual(
    ['categories', 'fixedExpenses', 'houseGoal', 'pctHistory', 'profile', 'savingGoals', 'transactions']
  )
})

it('explicit keys override the recorded ones', async () => {
  const before = snapshot()
  markDirty('transactions')
  await act(async () => { await api.refresh(['houseGoal']) })
  expect(diff(before)).toEqual({ houseGoal: 1 })
})

it('removes a movement locally and can restore it', async () => {
  await act(async () => { api.setTransactions([{ id: 'a' }, { id: 'b' }]) })
  let restore
  await act(async () => { restore = api.removeTransactionLocally('a') })
  expect(api.transactions.map(t => t.id)).toEqual(['b'])
  await act(async () => { restore() })
  expect(api.transactions.map(t => t.id).sort()).toEqual(['a', 'b'])
})
